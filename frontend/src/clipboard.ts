// Invoke from the click handler so mobile browsers retain user activation.
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const previousFocus = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.cssText =
    "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
  document.body.append(input);
  try {
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    input.remove();
    if (previousFocus instanceof HTMLElement)
      previousFocus.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
}
