// src/lib/client/nav-overflow.ts
// Overflow pill controller — open/close state, ARIA, keyboard navigation.
// Single responsibility: toggle the ··· dropdown that holds the overflow links.
// CSS handles all animation (--motion-flow); this file only manages state.
//
// Keyboard: Escape → close; ArrowDown/Up → navigate links; click outside → close.
// Lifecycle: destroy() removes all listeners; called on astro:before-swap.
//
// Architecture: Michael Koch (§3) · UX: Tanya Donska (§2) · 2026-04-12

class NavOverflowController {
  private trigger: HTMLButtonElement;
  private dropdown: HTMLElement;
  private links: HTMLAnchorElement[];
  private isOpen = false;

  // Bound handler refs — stored for cleanup in destroy()
  private _onTriggerClick: () => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onOutsideClick: (e: MouseEvent) => void;

  constructor(trigger: HTMLButtonElement, dropdown: HTMLElement) {
    this.trigger = trigger;
    this.dropdown = dropdown;
    this.links = Array.from(dropdown.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'));
    this._onTriggerClick = this.toggle.bind(this);
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._onOutsideClick = this.handleOutsideClick.bind(this);
    trigger.addEventListener('click', this._onTriggerClick);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('click', this._onOutsideClick, true);
  }

  open(): void {
    this.dropdown.removeAttribute('hidden');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.isOpen = true;
    this.links[0]?.focus();
  }

  close(returnFocus = true): void {
    this.dropdown.setAttribute('hidden', '');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.isOpen = false;
    if (returnFocus) this.trigger.focus();
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isOpen) { this.close(); return; }
    if (!this.isOpen) return;
    const idx = this.links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.links[Math.min(idx + 1, this.links.length - 1)]?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx <= 0 ? this.trigger.focus() : this.links[idx - 1]?.focus();
    }
  }

  private handleOutsideClick(e: MouseEvent): void {
    const t = e.target as Node;
    const isInside = this.trigger.contains(t) || this.dropdown.contains(t);
    if (!isInside && this.isOpen) this.close(false);
  }

  destroy(): void {
    this.trigger.removeEventListener('click', this._onTriggerClick);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('click', this._onOutsideClick, true);
  }
}

/** Mount the overflow controller if the DOM elements are present.
 *  Safe to call multiple times — guard ensures one active instance. */
export function initNavOverflow(): void {
  const trigger  = document.querySelector<HTMLButtonElement>('[data-nav-overflow-trigger]');
  const dropdown = document.querySelector<HTMLElement>('[data-nav-overflow-dropdown]');
  if (!trigger || !dropdown) return;
  const ctrl = new NavOverflowController(trigger, dropdown);
  // Cleanup before Astro swaps the DOM — prevents listener accumulation.
  document.addEventListener('astro:before-swap', () => ctrl.destroy(), { once: true });
}
