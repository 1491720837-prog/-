// Capture the page itself, excluding selection UI. Translated HTML must be
// composited with its PDF background rather than cropping the English canvas.
export async function capturePageRegion({ sheet, canvas }, region) {
  const bounds = sheet.getBoundingClientRect();
  const ratio = canvas ? canvas.width / bounds.width : Math.min(devicePixelRatio || 1, 2);
  const result = document.createElement("canvas");
  result.width = Math.max(1, Math.round(region.w * ratio));
  result.height = Math.max(1, Math.round(region.h * ratio));
  const context = result.getContext("2d");
  if (canvas && !sheet.querySelector(".translation-block")) {
    context.drawImage(canvas, region.x * ratio, region.y * ratio,
      region.w * ratio, region.h * ratio, 0, 0, result.width, result.height);
  } else {
    await document.fonts.ready;
    const clone = clonePage(sheet);
    Object.assign(clone.style, {
      position: "relative", left: "0", top: "0", margin: "0", transform: "none",
      width: bounds.width + "px", height: bounds.height + "px",
    });
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const content = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${result.width}" height="${result.height}" viewBox="${region.x} ${region.y} ${region.w} ${region.h}"><foreignObject width="${bounds.width}" height="${bounds.height}">${content}</foreignObject></svg>`;
    const image = new Image();
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await image.decode();
    context.drawImage(image, 0, 0);
  }
  return result.toDataURL("image/png");
}

function clonePage(element) {
  if (element.nodeType !== Node.ELEMENT_NODE) return element.cloneNode();
  if (element.matches(".crop-overlay,.highlight-layer,.textLayer")) return document.createTextNode("");
  const clone = element instanceof HTMLCanvasElement ? document.createElement("img") : element.cloneNode(false);
  if (element instanceof HTMLCanvasElement) clone.src = element.toDataURL("image/png");
  const style = getComputedStyle(element);
  for (const property of style) clone.style.setProperty(property, style.getPropertyValue(property));
  clone.removeAttribute("id");
  if (!(element instanceof HTMLCanvasElement)) {
    const children = [...element.childNodes].map(clonePage);
    if (element.scrollTop || element.scrollLeft) {
      const inner = document.createElement("div");
      inner.style.transform = `translate(${-element.scrollLeft}px, ${-element.scrollTop}px)`;
      inner.append(...children);
      clone.style.overflow = "hidden";
      clone.append(inner);
    } else clone.append(...children);
  }
  return clone;
}
