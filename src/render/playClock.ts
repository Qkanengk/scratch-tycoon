export class PlayClock {
  private last: number | null = null;
  private active = false;
  private pending = 0;

  update(now: number, active: boolean): number {
    if (this.last !== null && this.active) this.pending += Math.max(0, now - this.last);
    this.last = now;
    this.active = active;
    if (this.pending < 1000 && active) return 0;
    const elapsed = this.pending;
    this.pending = 0;
    return elapsed;
  }
}
