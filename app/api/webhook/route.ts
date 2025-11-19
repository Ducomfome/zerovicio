import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

// Config Firebase
const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}');
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Config Facebook CAPI
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const FACEBOOK_PIXEL_ID = '792797553335143'; // Seu ID do Pixel

// Função auxiliar para enviar evento ao Facebook
async function trackFacebookEvent(eventName: string, userData: any, customData: any) {
  if (!FACEBOOK_ACCESS_TOKEN) return;

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      user_data: {
        fbp: userData.fbp,
        fbc: userData.fbc,
        em: userData.email ? [userData.email] : undefined, // Email hasheado (idealmente)
      },
      custom_data: customData
    }],
    access_token: FACEBOOK_ACCESS_TOKEN
  };

  try {
    await fetch(`https://graph.facebook.com/v17.0/${FACEBOOK_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`🎯 Pixel Facebook (${eventName}) disparado via Server-Side!`);
  } catch (e) {
    console.error('Erro ao disparar Pixel:', e);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔔 Webhook recebido:", body);

    // A PushinPay envia o ID da transação e o status
    const transactionId = body.id;
    const status = body.status;

    if (!transactionId) {
      return NextResponse.json({ message: 'ID não fornecido' }, { status: 400 });
    }

    // 1. Buscar a transação no banco de dados para pegar o fbp/fbc que salvamos antes
    const docRef = doc(db, "transactions", transactionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log("Transação não encontrada no banco:", transactionId);
      return NextResponse.json({ message: 'Transação desconhecida' });
    }

    const transactionData = docSnap.data();

    // 2. Se o pagamento for APROVADO
    if (status === 'paid') {
        console.log(`💰 Pagamento Aprovado: ${transactionId}`);

        // Atualiza status no banco
        await updateDoc(docRef, { status: 'paid', paidAt: new Date().toISOString() });

        // 3. Dispara o evento de Purchase Server-Side (CAPI)
        await trackFacebookEvent(
            'Purchase',
            { 
                fbp: transactionData.fbp, 
                fbc: transactionData.fbc,
                email: transactionData.email // O Facebook usa isso para matching avançado
            }, 
            {
                currency: 'BRL',
                value: transactionData.price,
                transaction_id: transactionId
            }
        );
    } else {
        // Atualiza outros status (ex: pending, failed)
        await updateDoc(docRef, { status: status });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro no Webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}