// Reading an OpenAI-compatible /models catalog.
// Dependency-free so the local gateway and the cloud worker share one shape.

export function normalizeModels(data) {
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .filter((m) => m && typeof m.id === "string" && m.id)
    .map((m) => ({
      id: m.id,
      name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : m.id,
      context: Number(m.context_length) || 0,
      tools:
        Array.isArray(m.supported_parameters) &&
        m.supported_parameters.includes("tools"),
      vision:
        Array.isArray(m.architecture?.input_modalities) &&
        m.architecture.input_modalities.includes("image"),
      prompt: Number(m.pricing?.prompt) || 0,
      completion: Number(m.pricing?.completion) || 0,
    }));
}

// The catalog is advice, not a gate: a stale or unreachable catalog must never
// block a model that actually works. Only a known model reported without tool
// support is rejected, because project chat depends on searching the full text.
export function toolSupport(models, id) {
  const entry = Array.isArray(models)
    ? models.find((m) => m.id === id)
    : undefined;
  return entry ? entry.tools : null;
}

export function requireToolSupport(models, id) {
  const tools = toolSupport(models, id);
  if (tools === false)
    throw Error(
      `模型 ${id} 不支持工具调用，无法检索项目全文。请换用支持 tools 的模型，或改用 Codex。`,
    );
  return tools;
}
