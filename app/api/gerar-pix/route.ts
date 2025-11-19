import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// --- INICIALIZAÇÃO SEGURA DO FIREBASE ---
const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  
  if (!configStr) {
    throw new Error('❌ Váriavel NEXT_PUBLIC_FIREBASE_CONFIG não encontrada!');
  }

  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) {
    console.error("Erro ao fazer parse do JSON do Firebase:", e);
    throw new Error('❌ Erro na formatação do JSON do Firebase');
  }
};

export async function POST(request: Request) {
  try {
    const app = initFirebase();
    const db = getFirestore(app);
    
    // 1. CREDENCIAIS PARADISE PAGS
    const RECIPIENT_ID = process.env.PARADISE_RECIPIENT_ID; // ID da sua Conta
    const SECRET_KEY = process.env.PARADISE_SECRET_KEY;     // Chave Secreta

    if (!RECIPIENT_ID || !SECRET_KEY) {
      console.error("Credenciais Paradise Pags ausentes");
      return NextResponse.json({ error: 'Configuração de API incompleta' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, fbp, fbc, plan } = body;

    if (!name || !cpf || !price) {
       return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // URL do seu Webhook
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook`;

    // 2. MONTAGEM DO PAYLOAD
    const transactionId = crypto.randomUUID();

    const paymentPayload = {
      requestNumber: transactionId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: Number(price),
      shippingAmount: 0.0,
      username: "checkout_site", // Pode ser um identificador fixo
      callbackUrl: webhookUrl,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    console.log("🚀 Enviando para Paradise Pags...", JSON.stringify(paymentPayload));

    // 3. URL DO ENDPOINT
    // Se a Paradise tiver uma URL específica, confirme na documentação.
    // Padrão de mercado para gateways desse tipo:
    const API_URL = "https://api.paradisepags.com/v1/gateway/request-qrcode";

    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ci': RECIPIENT_ID, // Header padrão para "Recipient ID" ou "Client ID"
        'cs': SECRET_KEY    // Header padrão para "Client Secret"
      },
      body: JSON.stringify(paymentPayload)
    });

    const data = await gatewayResponse.json();
    console.log("Retorno Gateway:", data);

    if (!gatewayResponse.ok) {
      return NextResponse.json({ error: 'Erro na Paradise Pags', details: data }, { status: 500 });
    }

    // 4. TRATAMENTO DA RESPOSTA
    // Verifica os campos possíveis de retorno (padrão SuitPay/Paradise)
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    // Salva no Firestore
    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise',
        plan: plan || 'unknown',
        email: email,
        name: name,
        price: price,
        fbp: fbp || null,
        fbc: fbc || null, 
        createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      id: finalId,
      qrCodeBase64: qrCodeImage || null,
      copiaECola: pixCopiaCola
    });

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
