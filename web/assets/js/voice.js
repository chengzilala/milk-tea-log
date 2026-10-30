/* 语音备注（v0.20.0）
 * 只做两件事：把说的话录成 Blob（跟着记录存在本机），以及按需转成文字。
 * 转文字顺序：服务端转写（/api/transcribe，Key 只在服务端）→ 手机浏览器自带识别（边说边转）→ 只保留语音。
 * 交互只用「点一下开始 / 点一下停止」，不用按住说话，单手好点也更稳。
 */
(function () {
  "use strict";

  const MAX_SECONDS = 60;
  const MIME_CANDIDATES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  let sttReadyPromise = null;

  function supported() {
    return Boolean(
      window.MediaRecorder &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
    );
  }

  function dictationSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function pickMime() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return "";
    for (let i = 0; i < MIME_CANDIDATES.length; i += 1) {
      if (MediaRecorder.isTypeSupported(MIME_CANDIDATES[i])) return MIME_CANDIDATES[i];
    }
    return "";
  }

  // 服务端有没有配转写 Key：只读 health，不发送任何音频。
  function sttReady() {
    if (!sttReadyPromise) {
      sttReadyPromise = fetch("/api/health", { headers: { accept: "application/json" } })
        .then((response) => response.json())
        .then((data) => Boolean(data && data.sttConfigured))
        .catch(() => false);
    }
    return sttReadyPromise;
  }

  function fileExt(mime) {
    const type = String(mime || "");
    if (type.indexOf("mp4") >= 0) return "m4a";
    if (type.indexOf("ogg") >= 0) return "ogg";
    return "webm";
  }

  function createSession(handlers) {
    const on = handlers || {};
    let stream = null;
    let recorder = null;
    let chunks = [];
    let startedAt = 0;
    let tickTimer = 0;
    let recognition = null;
    let dictating = false;
    let dictationRestarts = 0;
    let cancelled = false;
    let blob = null;
    let seconds = 0;
    let url = "";

    function emit(name, payload) {
      if (typeof on[name] === "function") on[name](payload);
    }

    function stopStream() {
      if (!stream) return;
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    function stopDictation() {
      dictating = false;
      if (!recognition) return;
      try {
        recognition.stop();
      } catch (err) {
        /* 已经停了 */
      }
      recognition = null;
    }

    function startDictation() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return false;
      try {
        recognition = new SpeechRecognition();
        recognition.lang = "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            if (event.results[i].isFinal) text += event.results[i][0].transcript;
          }
          if (text.trim()) emit("onText", text.trim());
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          // 浏览器听一段静音会自己结束；还处于录音状态就接着听，最多续 5 次。
          if (!dictating || dictationRestarts >= 5) return;
          dictationRestarts += 1;
          try {
            recognition.start();
          } catch (err) {
            /* 续不上就算了，语音还在 */
          }
        };
        recognition.start();
        dictating = true;
        return true;
      } catch (err) {
        recognition = null;
        dictating = false;
        return false;
      }
    }

    function tick() {
      const elapsed = Math.min(MAX_SECONDS, (Date.now() - startedAt) / 1000);
      emit("onTick", { elapsed, max: MAX_SECONDS });
      if (elapsed >= MAX_SECONDS) stop();
    }

    function reset() {
      if (url) URL.revokeObjectURL(url);
      url = "";
      blob = null;
      seconds = 0;
    }

    async function start(options) {
      if (recorder) return;
      reset();
      cancelled = false;
      chunks = [];
      dictationRestarts = 0;
      const mime = pickMime();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        recorder = null;
        stopStream();
        if (cancelled) {
          chunks = [];
          return;
        }
        blob = new Blob(chunks, { type });
        chunks = [];
        seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        if (!blob.size) {
          blob = null;
          emit("onError", "没录到声音，再说一次");
          return;
        }
        url = URL.createObjectURL(blob);
        emit("onDone", { blob, mime: type, seconds, url });
      };
      startedAt = Date.now();
      recorder.start(1000);
      tickTimer = window.setInterval(tick, 300);
      emit("onTick", { elapsed: 0, max: MAX_SECONDS });
      if (options && options.dictation) startDictation();
    }

    function stop() {
      if (tickTimer) {
        window.clearInterval(tickTimer);
        tickTimer = 0;
      }
      stopDictation();
      if (!recorder) return;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
          return;
        } catch (err) {
          /* 落到下面兜底 */
        }
      }
      recorder = null;
      stopStream();
    }

    function cancel() {
      cancelled = true;
      stop();
      reset();
    }

    async function transcribe() {
      if (!blob) throw new Error("还没有语音");
      const form = new FormData();
      form.append("audio", blob, "voice." + fileExt(blob.type));
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error((data && data.message) || "转文字没成功，语音已经留着");
        }
        return String((data && data.text) || "").trim();
      } catch (err) {
        if (err && err.name === "AbortError") throw new Error("转文字超时，语音已经留着");
        throw err;
      } finally {
        window.clearTimeout(timer);
      }
    }

    return {
      start,
      stop,
      cancel,
      reset,
      transcribe,
      getBlob: () => blob,
      getUrl: () => url,
      getSeconds: () => seconds,
    };
  }

  window.MtlVoice = {
    supported,
    dictationSupported,
    sttReady,
    createSession,
    maxSeconds: MAX_SECONDS,
  };
})();
