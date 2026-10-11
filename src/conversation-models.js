export const MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Fast conversation · Llama 1B' },
  { id: 'gemma-2b-it-q4f16_1-MLC', label: 'Original conversation · Gemma 2B' },
];
export function conversationModel(saved) {
  return MODELS.find(model => model.id === saved) || MODELS[0];
}
