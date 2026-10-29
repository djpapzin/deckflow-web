/** Keep transport shortcuts out of typing, Cue preview, and handled key events. */
export function isTransportSpace(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented' | 'target'>): boolean {
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return false;
  const target = event.target as Element | null;
  return !target?.closest('input, textarea, select, .cue-btn, summary, [contenteditable]:not([contenteditable="false"])');
}
