import { 
  submitContact, 
  testApiConnection, 
  API_URL,
  resetRateLimit,
  type ContactData 
} from '@/utils/api';


const VALID_CONTACT: ContactData = {
  name: 'Jean Dupont',
  email: 'jean.dupont@example.com',
  phone: '0612345678',
  country: 'France',
  address: '123 rue de la Paix',
  zip_code: '75001',
  service: 'Starterkit Next.js',
  message: 'Bonjour, je souhaite obtenir plus d\'informations sur vos starterkits Next.js. Merci !',
  timestamp: Date.now(),
};

const INVALID_CONTACT: ContactData = {
  name: 'A',
  email: 'invalid-email',
  country: '',
  service: '',
  message: 'Court',
  timestamp: Date.now(),
};

const SPAM_CONTACT: ContactData = {
  ...VALID_CONTACT,
  message: 'Buy cheap viagra now! Click here for lottery prize!',
};

// ============================================
// TESTS
// ============================================

async function testHealthCheck(): Promise<void> {
  console.log('\n🔍 TEST 1: Health Check');
  console.log('====================================');
  
  try {
    const isHealthy = await testApiConnection();
    
    if (isHealthy) {
      console.log('✅ API est accessible');
      console.log(`📍 URL: ${API_URL}`);
    } else {
      console.log('❌ API non accessible');
      console.log(`📍 URL testée: ${API_URL}`);
      console.log('💡 Vérifiez que Laravel est démarré: php artisan serve');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

async function testValidContact(): Promise<void> {
  console.log('\n✅ TEST 2: Contact valide');
  console.log('====================================');
  
  try {
    const result = await submitContact(VALID_CONTACT);
    console.log('✅ Contact créé:', result);
    console.log('📋 ID:', result.data?.id);
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

async function testInvalidContact(): Promise<void> {
  console.log('\n❌ TEST 3: Contact invalide (validation)');
  console.log('====================================');
  
  try {
    await submitContact(INVALID_CONTACT);
    console.log('⚠️ ERREUR: devrait avoir échoué');
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      console.log('✅ Validation échouée comme prévu');
      console.log('📋 Erreurs:', error.errors);
    } else {
      console.error('❌ Erreur inattendue:', error);
    }
  }
}

async function testSpamDetection(): Promise<void> {
  console.log('\n🚫 TEST 4: Détection spam');
  console.log('====================================');
  
  try {
    await submitContact(SPAM_CONTACT);
    console.log('⚠️ ATTENTION: le spam n\'a pas été bloqué');
  } catch (error: any) {
    if (error.status === 429 || error.message.includes('spam')) {
      console.log('✅ Spam détecté et bloqué');
    } else {
      console.log('ℹ️ Bloqué pour une autre raison:', error.message);
    }
  }
}

async function testRateLimit(): Promise<void> {
  console.log('\n⏱️ TEST 5: Rate limiting');
  console.log('====================================');
  
  // Reset d'abord
  resetRateLimit('contact');
  
  try {
    console.log('Envoi #1...');
    await submitContact(VALID_CONTACT);
    console.log('✅ #1 passé');

    console.log('Envoi #2...');
    await submitContact({ ...VALID_CONTACT, email: 'test2@example.com' });
    console.log('✅ #2 passé');

    console.log('Envoi #3...');
    await submitContact({ ...VALID_CONTACT, email: 'test3@example.com' });
    console.log('✅ #3 passé');

    console.log('Envoi #4 (devrait échouer)...');
    await submitContact({ ...VALID_CONTACT, email: 'test4@example.com' });
    console.log('⚠️ ERREUR: devrait avoir été bloqué par rate limit');
    
  } catch (error: any) {
    if (error.name === 'RateLimitError') {
      console.log('✅ Rate limit atteint comme prévu');
      console.log('📋 Message:', error.message);
    } else {
      console.error('❌ Erreur inattendue:', error);
    }
  }
}

async function testRetryLogic(): Promise<void> {
  console.log('\n🔄 TEST 6: Retry logic (simulé)');
  console.log('====================================');
  console.log('ℹ️ Ce test nécessite de couper temporairement Laravel');
  console.log('ℹ️ Puis de le redémarrer pendant la phase de retry');
  console.log('⏭️ Test ignoré (nécessite interaction manuelle)');
}

async function runAllTests(): Promise<void> {
  console.log('\n🚀 DÉBUT DES TESTS API');
  console.log('==========================================');
  console.log(`📍 API URL: ${API_URL}`);
  console.log('==========================================');

  await testHealthCheck();
  
  const isHealthy = await testApiConnection();
  if (!isHealthy) {
    console.log('\n⚠️ API non accessible. Tests annulés.');
    console.log('💡 Démarrez Laravel: php artisan serve');
    return;
  }

  await testValidContact();
  await testInvalidContact();
  await testSpamDetection();
  await testRateLimit();
  await testRetryLogic();

  console.log('\n✅ TESTS TERMINÉS');
  console.log('==========================================');
  console.log('💡 Conseil: Vérifiez les logs Laravel pour voir les traces côté serveur');
}

// Run tests
if (typeof window === 'undefined') {
  // Node environment
  runAllTests().catch(console.error);
} else {
  // Browser environment
  console.log('🌐 Mode browser détecté');
  console.log('💡 Utilisez: window.runApiTests()');
  (window as any).runApiTests = runAllTests;
}

export { runAllTests };