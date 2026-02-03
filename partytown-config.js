// partytown-config.js
export default {
  forward: ['dataLayer.push'],
  useSandbox: false, // Désactive le sandbox problématique
  
  // Empêcher le chargement des scripts avec APIs dépréciées
  resolveUrl: function(url, location, type) {
    // Liste noire des APIs dépréciées
    const deprecatedAPIs = [
      'shared-storage',
      'attribution-reporting',
      'private-state-tokens',
      'interest-group',
    ];
    
    for (const api of deprecatedAPIs) {
      if (url.includes(api)) {
        console.warn(`[Partytown] API dépréciée détectée et bloquée: ${api}`);
        return null; // Bloquer le script
      }
    }
    
    return url;
  },
  
  // Désactiver le debug en production
  debug: process.env.NODE_ENV === 'development',
};