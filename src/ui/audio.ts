export function speakForm(form: string, opts: { rate?: number; pitch?: number } = {}): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const text = form.trim();
  if (!text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts.rate ?? 0.7;
  utter.pitch = opts.pitch ?? 1;
  window.speechSynthesis.speak(utter);
}

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
