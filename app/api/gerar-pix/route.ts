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
    // .trim() é essencial para evitar erros de "Access Denied" por espaço vazio
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    // Debug: Mostra se as chaves estão sendo lidas (apenas o final para segurança)
    console.log(`🔑 Chaves: StoreID=...${RECIPIENT_ID.slice(-4)} | Secret=...${SECRET_KEY.slice(-4)}`);

    if (!RECIPIENT_ID || !SECRET_KEY) {
      return NextResponse.json({ error: 'Credenciais não configuradas na Vercel' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;

    if (!name || !cpf || !price) {
       return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook`;
    const transactionId = crypto.randomUUID();

    const paymentPayload = {
      requestNumber: transactionId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: Number(price),
      shippingAmount: 0.0,
      username: "checkout_site",
      callbackUrl: webhookUrl,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    console.log("🚀 Enviando Payload...", JSON.stringify(paymentPayload));

    // 2. CONFIGURAÇÃO ESPECÍFICA PARADISE PAGS
    // Baseado no print: "Use esta chave no header X-API-Key"
    const API_URL = "https://ws.suitpay.app/api/v1/gateway/request-qrcode";
    
    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SECRET_KEY, // AQUI ESTAVA O SEGREDO! (Antes era 'cs')
        'ci': RECIPIENT_ID       // Enviamos o StoreID como identificador
      },
      body: JSON.stringify(paymentPayload)
    });

    const responseText = await gatewayResponse.text();
    console.log("📩 Resposta do Gateway (Status " + gatewayResponse.status + "):", responseText);

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        return NextResponse.json({ error: 'Resposta inválida do Gateway', rawResponse: responseText }, { status: 502 });
    }

    if (gatewayResponse.status === 403 || gatewayResponse.status === 401) {
        return NextResponse.json({ error: 'Acesso Negado. Verifique se a Chave Secreta na Vercel começa com "sk_"', details: data }, { status: 403 });
    }

    if (!gatewayResponse.ok || data.response === 'Error') {
      return NextResponse.json({ error: 'Erro no processamento', details: data }, { status: 500 });
    }

    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise_suitpay',
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
