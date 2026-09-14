import { keyEvent, modifierMask, mouseEvent, toRemotePoint, wheelEvent } from "./browser-input";

/**
 * The remote browser's picture is scaled to fit the modal, so every coordinate
 * has to be converted back. Getting this wrong is invisible: the click still
 * goes somewhere, just not where the admin aimed it.
 */
describe("driving the remote browser", () => {
  const remote = { width: 1280, height: 800 };

  describe("mapping a click back into the page", () => {
    it("scales a half-size canvas up", () => {
      expect(toRemotePoint(100, 50, { width: 640, height: 400 }, remote)).toEqual({
        x: 200,
        y: 100,
      });
    });

    it("passes a point straight through when the sizes match", () => {
      expect(toRemotePoint(640, 400, remote, remote)).toEqual({ x: 640, y: 400 });
    });

    it("scales the axes independently", () => {
      expect(toRemotePoint(50, 50, { width: 640, height: 200 }, remote)).toEqual({
        x: 100,
        y: 200,
      });
    });

    // A drag can leave the canvas, and there is no negative pixel to click.
    it("clamps a point dragged off the canvas", () => {
      expect(toRemotePoint(-20, -30, { width: 640, height: 400 }, remote)).toEqual({
        x: 0,
        y: 0,
      });
      expect(toRemotePoint(10_000, 10_000, { width: 640, height: 400 }, remote)).toEqual({
        x: 1280,
        y: 800,
      });
    });

    it("survives a canvas that has not been laid out yet", () => {
      expect(toRemotePoint(10, 10, { width: 0, height: 0 }, remote)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("mouse events", () => {
    it("names the button", () => {
      expect(mouseEvent("mousePressed", { x: 1, y: 2 }, 0)).toMatchObject({ button: "left" });
      expect(mouseEvent("mousePressed", { x: 1, y: 2 }, 2)).toMatchObject({ button: "right" });
    });

    it("sends a move with no button held", () => {
      expect(mouseEvent("mouseMoved", { x: 1, y: 2 })).toMatchObject({
        button: "none",
        clickCount: 0,
      });
    });

    it("rounds wheel deltas", () => {
      expect(wheelEvent({ x: 0, y: 0 }, 1.6, -2.4)).toMatchObject({ deltaX: 2, deltaY: -2 });
    });
  });

  describe("keystrokes", () => {
    const mods = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

    /**
     * Persian is the reason text is sent rather than a key code: the character
     * typed bears no relation to the physical key that produced it.
     */
    it("sends a printable character as text", () => {
      expect(keyEvent("keyDown", { key: "ب", code: "KeyD", ...mods })).toMatchObject({
        text: "ب",
        key: "ب",
      });
    });

    // Sending Enter as its five literal characters would type them into the
    // field instead of submitting the form.
    it("sends a named key with no text", () => {
      const event = keyEvent("keyDown", { key: "Enter", ...mods });
      expect(event).toMatchObject({ key: "Enter" });
      expect(event).not.toHaveProperty("text");
    });

    it("sends no text on key-up, which would otherwise type twice", () => {
      expect(keyEvent("keyUp", { key: "a", ...mods })).not.toHaveProperty("text");
    });

    it("treats a control chord as a command rather than text", () => {
      expect(keyEvent("keyDown", { key: "a", ...mods, ctrlKey: true })).not.toHaveProperty(
        "text",
      );
    });

    it("ignores a key that produces nothing on its own", () => {
      expect(keyEvent("keyDown", { key: "Shift", ...mods })).toBeNull();
      expect(keyEvent("keyDown", { key: "CapsLock", ...mods })).toBeNull();
    });

    it("packs the modifier mask the way CDP expects", () => {
      expect(modifierMask({ ...mods })).toBe(0);
      expect(modifierMask({ ...mods, altKey: true })).toBe(1);
      expect(modifierMask({ ...mods, ctrlKey: true })).toBe(2);
      expect(modifierMask({ ...mods, metaKey: true })).toBe(4);
      expect(modifierMask({ ...mods, shiftKey: true })).toBe(8);
      expect(modifierMask({ altKey: true, ctrlKey: true, metaKey: true, shiftKey: true })).toBe(
        15,
      );
    });
  });
});
