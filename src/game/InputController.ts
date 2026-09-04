import { clamp, normalize } from './rules';
import type { JoystickMode, Vec2 } from './types';

export class InputController {
  readonly move: Vec2 = { x: 0, y: 0 };
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private origin: Vec2 = { x: 0, y: 0 };
  private readonly radius = 56;
  private mode: JoystickMode;

  constructor(
    private readonly surface: HTMLElement,
    private readonly joystick: HTMLElement,
    private readonly knob: HTMLElement,
    mode: JoystickMode,
    private readonly onFirstInteraction: () => void
  ) {
    this.mode = mode;
    this.surface.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp, { passive: false });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);
    this.applyMode();
  }

  setMode(mode: JoystickMode): void { this.mode = mode; this.applyMode(); }

  update(): Vec2 {
    if (this.pointerId !== null) return this.move;
    const left = this.keys.has('arrowleft') || this.keys.has('a');
    const right = this.keys.has('arrowright') || this.keys.has('d');
    const up = this.keys.has('arrowup') || this.keys.has('w');
    const down = this.keys.has('arrowdown') || this.keys.has('s');
    const direction = normalize(Number(right) - Number(left), Number(down) - Number(up));
    this.move.x = direction.x;
    this.move.y = direction.y;
    return this.move;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,select,label,.modal-screen')) return;
    event.preventDefault();
    this.onFirstInteraction();
    this.pointerId = event.pointerId;
    if (this.mode === 'fixed') {
      const rect = this.surface.getBoundingClientRect();
      this.origin = { x: rect.left + 88, y: rect.bottom - 112 };
    } else {
      this.origin = { x: event.clientX, y: event.clientY };
      this.joystick.style.left = `${event.clientX}px`;
      this.joystick.style.top = `${event.clientY}px`;
    }
    this.joystick.classList.remove('hidden');
    this.movePointer(event.clientX, event.clientY);
    this.surface.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.movePointer(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.pointerId = null;
    this.move.x = 0;
    this.move.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    if (this.mode === 'floating') this.joystick.classList.add('hidden');
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
      this.onFirstInteraction();
      this.keys.add(key);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.key.toLowerCase()); };

  private movePointer(x: number, y: number): void {
    const dx = x - this.origin.x;
    const dy = y - this.origin.y;
    const direction = normalize(dx, dy);
    const distance = Math.min(this.radius, direction.magnitude);
    const analog = clamp((distance - 7) / (this.radius - 7), 0, 1);
    this.move.x = direction.x * analog;
    this.move.y = direction.y * analog;
    this.knob.style.transform = `translate(calc(-50% + ${direction.x * distance}px), calc(-50% + ${direction.y * distance}px))`;
  }

  private applyMode(): void {
    if (this.mode === 'fixed') {
      this.joystick.classList.remove('hidden');
      this.joystick.style.left = `calc(var(--safe-left) + 88px)`;
      this.joystick.style.top = `calc(100% - var(--safe-bottom) - 112px)`;
    } else if (this.pointerId === null) this.joystick.classList.add('hidden');
  }

  private readonly reset = (): void => {
    this.keys.clear();
    this.pointerId = null;
    this.move.x = 0;
    this.move.y = 0;
  };
}
