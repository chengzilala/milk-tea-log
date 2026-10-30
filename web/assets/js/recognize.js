/**
 * AI 识别客户端。
 * 前端不持有任何 Key，只调用自有服务端的 /api/recognize。
 */
window.MtlRecognize = {
  endpoint: "/api/recognize",
  cutoutEndpoint: "/api/cutout",
  timeoutMs: 30000,
  cutoutTimeoutMs: 25000,

  /**
   * @param {Blob} imageBlob 已压缩的 JPEG
   * @returns {Promise<{drinkName:string, brand:string, category:string, priceHint:number, confidence:number, mock?:boolean}>}
   */
  async recognize(imageBlob) {
    if (!imageBlob) throw new Error("没有可识别的图片");

    const body = new FormData();
    body.append("image", imageBlob, "milk-tea.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.message || "识别服务暂时不可用");
        error.code = data.error || "AI_FAILED";
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        const error = new Error("识别超时，先手动写饮品名也能保存");
        error.code = "AI_TIMEOUT";
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * 服务端抠图（remove.bg 代理），返回透明 PNG。
   * 未配置 Key 时服务端返回 503，调用方应静默降级为原图贴纸。
   * @param {Blob} imageBlob 已压缩的 JPEG
   * @returns {Promise<Blob>}
   */
  async cutout(imageBlob) {
    if (!imageBlob) throw new Error("没有可抠图的图片");

    const body = new FormData();
    body.append("image", imageBlob, "milk-tea.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cutoutTimeoutMs);

    try {
      const response = await fetch(this.cutoutEndpoint, {
        method: "POST",
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.message || "抠图服务暂时不可用");
        error.code = data.error || "CUTOUT_FAILED";
        throw error;
      }

      return await response.blob();
    } catch (err) {
      if (err.name === "AbortError") {
        const error = new Error("抠图超时，先用原图也可以");
        error.code = "CUTOUT_TIMEOUT";
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
};
