module.exports = {
  extends: ['@headlamp-k8s/eslint-config'],
  rules: {
    // Prettier handles indentation; the shared config's indent rule
    // conflicts with Prettier's JSX ternary formatting.
    indent: 'off',
  },
};
