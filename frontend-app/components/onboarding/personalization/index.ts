// Main exports for personalization components
// Note: Avoid exporting parent components from this barrel to prevent
// circular dependencies in the module graph.
export { PersonalizationFormComplete } from './PersonalizationFormComplete';
export { NavigationController } from './NavigationController';
export { ValidationBanner } from './ValidationBanner';

// Re-export hooks and sections
export * from './hooks';
export * from './sections';
