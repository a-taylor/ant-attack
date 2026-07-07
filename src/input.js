export class Input {
  constructor(dom) {
    this.down = new Set();
    this.pressed = new Set(); // edge-triggered, consumed once per frame
    this.released = new Set(); // same, for key-up (hold-to-charge throws)
    this.dragDX = 0;
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());

    dom.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', () => (this._dragging = false));
    dom.addEventListener('pointercancel', () => (this._dragging = false));
    dom.addEventListener('pointermove', (e) => {
      if (this._dragging) this.dragDX += e.movementX;
    });
  }

  axis(negCodes, posCodes) {
    const has = (codes) => codes.some((c) => this.down.has(c));
    return (has(posCodes) ? 1 : 0) - (has(negCodes) ? 1 : 0);
  }

  consumePressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeReleased(code) {
    if (this.released.has(code)) {
      this.released.delete(code);
      return true;
    }
    return false;
  }

  isDown(code) {
    return this.down.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.dragDX = 0;
  }
}
