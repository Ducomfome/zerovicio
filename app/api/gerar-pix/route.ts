import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// 1. Configuração Firebase (Singleton Pattern para evitar reinicialização)
// Garante que a conexão com o banco não seja refeita a cada requisição
const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}');
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Variável de Ambiente (Adicione no seu .env.local)
const PUSHIN_TOKEN = process.env.PUSHIN_TOKEN; 

export async function POST(request: Request) {
  try {
    // 1. Pegar dados enviados pelo Frontend (app/page.tsx)
    const body = await request.json();
    const { name, email, cpf, price, fbp, fbc, plan } = body;

    // Validação básica para garantir que o token existe
    if (!PUSHIN_TOKEN) {
      return NextResponse.json({ error: 'Configuração de servidor incompleta (Token ausente)' }, { status: 500 });
    }

    // 2. Preparar payload para PushinPay
    // Converter preço para centavos (Ex: 19.90 -> 1990) pois a API espera inteiros
    const valueInCents = Math.round(price * 100); 
    
    // URL do seu Webhook (onde a PushinPay vai avisar que pagou)
    // Em produção, isso deve ser a URL real do seu site (ex: https://seusite.com/api/webhook)
    // O NEXT_PUBLIC_BASE_URL deve estar configurado no seu .env.local
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook`;

    const paymentPayload = {
      value: valueInCents,
      webhook_url: webhookUrl,
      payer: {
        name: name,
        document: cpf.replace(/\D/g, ''), // Remove pontos e traços do CPF
        email: email,
      }
    };

    console.log("🚀 Gerando PIX na PushinPay...", paymentPayload);

    // 3. Chamar API da PushinPay
    const pushinResponse = await fetch('https://api.pushinpay.com.br/api/pix/cashIn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PUSHIN_TOKEN}`
      },
      body: JSON.stringify(paymentPayload)
    });

    const data = await pushinResponse.json();

    if (!pushinResponse.ok) {
      console.error('❌ Erro PushinPay:', data);
      return NextResponse.json({ error: 'Falha ao gerar Pix na operadora', details: data }, { status: 500 });
    }

    const transactionId = data.id;

    // 4. Salvar no Firestore (Essencial para o Webhook funcionar depois)
    // Aqui substituímos o objeto em memória do Node.js pelo banco de dados.
    // Isso permite recuperar o 'fbc' e 'fbp' quando o pagamento cair.
    await setDoc(doc(db, "transactions", transactionId), {
      status: 'created',
      plan: plan,
      email: email,
      name: name,
      price: price,
      // Salvamos os cookies do Facebook aqui para usar no evento de Purchase depois
      fbp: fbp || null,
      fbc: fbc || null, 
      createdAt: new Date().toISOString()
    });

    console.log(`✅ PIX gerado com sucesso: ${transactionId}`);

    // 5. Retornar os dados para o Frontend exibir o QR Code
    return NextResponse.json({
      id: transactionId,
      qrCodeBase64: data.qr_code_base64,
      copiaECola: data.qr_code
    });

  } catch (error: any) {
    console.error('❌ Erro Crítico API:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}