export function applySettingsRuntimeTransition(input: {
  previousEnabled: boolean;
  nextEnabled: boolean;
  onDisable: () => void;
  onEnable: () => void;
  onUnchanged: () => void;
}): void {
  if (input.previousEnabled && !input.nextEnabled) {
    input.onDisable();
    return;
  }
  if (!input.previousEnabled && input.nextEnabled) {
    input.onEnable();
    return;
  }
  input.onUnchanged();
}
