/**
 * Turning what happens on the admin's screen into what the remote browser
 * should be told.
 *
 * The picture arrives as JPEG frames drawn onto a canvas whose displayed size
 * rarely matches the browser's viewport — it is scaled to fit whatever space
 * the modal has. Every coordinate therefore has to be converted back into the
 * remote page's own pixels, or the clicks land somewhere other than where the
 * admin aimed them.
 *
 * Kept out of the component because getting this wrong is invisible: the click
 * goes somewhere, just not where it was meant to.
 */

export interface Viewport {
  width: number;
  height: number;
}

export interface RemotePoint {
  x: number;
  y: number;
}

/**
 * Maps a point on the displayed canvas to a point in the remote viewport.
 *
 * Clamped, because a drag can leave the canvas and a negative coordinate is
 * not somewhere the remote page can be clicked.
 */
export function toRemotePoint(
  offsetX: number,
  offsetY: number,
  displayed: Viewport,
  remote: Viewport,
): RemotePoint {
  if (!displayed.width || !displayed.height) return { x: 0, y: 0 };
  const scaleX = remote.width / displayed.width;
  const scaleY = remote.height / displayed.height;
  return {
    x: Math.max(0, Math.min(remote.width, Math.round(offsetX * scaleX))),
    y: Math.max(0, Math.min(remote.height, Math.round(offsetY * scaleY))),
  };
}

const BUTTONS = ['left', 'middle', 'right'] as const;

export function mouseEvent(
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
  point: RemotePoint,
  button = 0,
): Record<string, unknown> {
  return {
    kind: 'mouse',
    type,
    x: point.x,
    y: point.y,
    button: type === 'mouseMoved' ? 'none' : (BUTTONS[button] ?? 'left'),
    clickCount: type === 'mouseMoved' ? 0 : 1,
    modifiers: 0,
  };
}

export function wheelEvent(
  point: RemotePoint,
  deltaX: number,
  deltaY: number,
): Record<string, unknown> {
  return {
    kind: 'wheel',
    x: point.x,
    y: point.y,
    deltaX: Math.round(deltaX),
    deltaY: Math.round(deltaY),
    button: 'none',
    modifiers: 0,
  };
}

/** Keys that produce no character and have to be named rather than typed. */
const NAMED_KEYS = new Set([
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function modifierMask(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number {
  // The mask CDP expects: alt 1, ctrl 2, meta 4, shift 8.
  return (
    (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
  );
}

/**
 * Builds the key event for a keystroke.
 *
 * A printable character is sent as text so it arrives in the page as typed —
 * which matters for Persian, where the character bears no relation to the
 * physical key. A named key carries no text at all: sending `Enter` as the
 * literal five characters would type them into the field instead of submitting.
 */
export function keyEvent(
  type: 'keyDown' | 'keyUp',
  e: {
    key: string;
    code?: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  },
): Record<string, unknown> | null {
  const named = NAMED_KEYS.has(e.key);
  const printable = e.key.length === 1;
  if (!named && !printable) return null; // Shift, CapsLock, a dead key: nothing to send

  const event: Record<string, unknown> = {
    kind: 'key',
    type,
    key: e.key,
    code: e.code ?? '',
    modifiers: modifierMask(e),
  };

  // A control chord is a command, not text: Ctrl+A must select rather than
  // type an "a".
  if (printable && type === 'keyDown' && !e.ctrlKey && !e.metaKey) {
    event.text = e.key;
    event.type = 'keyDown';
  }
  return event;
}
