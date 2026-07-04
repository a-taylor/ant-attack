export class Input {
  constructor(dom) {
    this.down = new Set();
    this.pressed = new Set(); // edge-triggered, consumed once per frame
    this.dragDX = 0;
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
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

  endFrame() {
    this.pressed.clear();
    this.dragDX = 0;
  }
}
