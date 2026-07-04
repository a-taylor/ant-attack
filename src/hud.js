export class Hud {
  constructor() {
    this.timerEl = document.getElementById('timer');
    this.livesEl = document.getElementById('lives');
    this.grenadesEl = document.getElementById('grenades');
    this.objectiveEl = document.getElementById('objective');
    this.messageEl = document.getElementById('message');
    this.overlayEl = document.getElementById('overlay');
    this.msgTimer = 0;
  }

  setTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.classList.toggle('low', seconds < 60);
  }

  setLives(n) {
    this.livesEl.textContent = '♥'.repeat(Math.max(0, n)) || '—';
  }

  setGrenades(n) {
    this.grenadesEl.textContent = String(n);
  }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  message(text, seconds = 2.5) {
    this.messageEl.textContent = text;
    this.messageEl.classList.add('show');
    this.msgTimer = seconds;
  }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.messageEl.classList.remove('show');
    }
  }

  showTitle(character) {
    this.overlayEl.classList.remove('hidden');
    this.overlayEl.querySelector('h1').style.display = '';
    document.getElementById('char-sandy').classList.toggle('sel', character === 'sandy');
    document.getElementById('char-sandra').classList.toggle('sel', character === 'sandra');
  }

  showEnd(won, detail) {
    const big = won
      ? '<div class="big win">CITY ESCAPED!</div>'
      : '<div class="big lose">GAME OVER</div>';
    this.overlayEl.innerHTML = `
      ${big}
      <p>${detail}</p>
      <div class="press">PRESS R TO PLAY AGAIN</div>`;
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlayEl.classList.add('hidden');
  }
}
