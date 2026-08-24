const regex = /onAnalytics: screen === 'analytics', goAnalytics: mk\('analytics'\),/;
const s = `      goRecipeEditor: mk('recipeEditor'),
      onAnalytics: screen === 'analytics', goAnalytics: mk('analytics'),
      goMarkets: mk('markets'),`;
console.log(regex.test(s));
