// For tools that type-check without the Vue language plugin (typescript-eslint).
// vue-tsc resolves the real .vue files first.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}
