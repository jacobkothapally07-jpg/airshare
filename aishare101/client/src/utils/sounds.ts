class SoundHUD {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Sound effect for standard buttons/actions click
   */
  public playClick() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  /**
   * Synth sound effect for signaling radar search pulses
   */
  public playRadar() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 1.2);
      
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 1.2);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  /**
   * Synth arpeggio for successful WebRTC connection links
   */
  public playConnect() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      
      const playNote = (freq: number, delay: number, dur: number) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0.04, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
        
        osc.start(now + delay);
        osc.stop(now + delay + dur);
      };

      // Pentatonic/major ascending hook: C5 -> D5 -> G5 -> C6
      playNote(523.25, 0, 0.3);
      playNote(587.33, 0.06, 0.3);
      playNote(783.99, 0.12, 0.3);
      playNote(1046.50, 0.18, 0.5);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  /**
   * Ascending bell chime for a successful transfer verification
   */
  public playSuccess() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      
      const playNote = (freq: number, delay: number, dur: number) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0.05, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
        
        osc.start(now + delay);
        osc.stop(now + delay + dur);
      };

      playNote(880, 0, 0.2);
      playNote(1318.51, 0.08, 0.4);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  /**
   * Buzzing synth tone for a failed check or canceled queue
   */
  public playFailure() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.5);
      
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }
}

export const soundHUD = new SoundHUD();
