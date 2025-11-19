// app/api/gerar-pix/route.ts
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

interface PaymentStrategy {
  name: string;
  url: string;
  headers: Record<string, string>;
  payload?: any;
}

const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configStr) return null;
  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) { 
    console.error('❌ Erro Firebase config:', e);
    return null; 
  }
};

const safeSaveToFirestore = async (db: any, transactionId: string, data: any) => {
  try {
    await setDoc(doc(db, "transactions", transactionId), data);
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao salvar no Firestore:', error.message);
    return false;
  }
};

export async function POST(request: Request) {
  let debugInfo: any = {};

  try {
    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc, phone } = body;
    const transactionId = crypto.randomUUID();

    // Inicializar Firebase
    const app = initFirebase();
    const db = app ? getFirestore(app) : null;
    
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    debugInfo = {
      environment: process.env.NODE_ENV,
      hasSecretKey: !!SECRET_KEY,
      firebaseStatus: app ? 'connected' : 'failed',
    };

    console.log("🚀 Iniciando Paradise API Real...");

    // Payload CORRETO conforme documentação da Paradise
    const paradisePayload = {
      amount: Math.round(Number(price) * 100), // EM CENTAVOS (obrigatório)
      description: `${plan} - Zero Vicios`, // Nome do produto
      reference: transactionId, // Seu ID único
      postback_url: `${(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/webhook`,
      productHash: process.env.PARADISE_PRODUCT_HASH || "default", // Hash do produto no painel
      customer: {
        name: name.substring(0, 100),
        email: email,
        document: cpf.replace(/\D/g, ''), // Apenas números
        phone: phone ? phone.replace(/\D/g, '') : "11999999999" // Apenas números com DDD
      },
      tracking: {
        utm_source: "site",
        utm_medium: "direct",
        utm_campaign: "zero_vicios"
      }
    };

    // ESTRATÉGIAS CORRETAS da Paradise
    const strategies: PaymentStrategy[] = [
      {
        name: "Paradise Main API",
        url: "https://multi.paradisepags.com/api/v1/transaction.php",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      },
      {
        name: "Paradise Backup",
        url: "https://api.paradisepags.com/api/v1/transaction.php",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      }
    ];

    let successData: any = null;
    let workingStrategy: PaymentStrategy | null = null;

    // TESTAR APENAS SE HOUVER CHAVE VÁLIDA
    if (SECRET_KEY && SECRET_KEY.length > 20) {
      for (const strat of strategies) {
        console.log(`🔄 Tentando: ${strat.name}`);
        console.log(`   URL: ${strat.url}`);
        console.log(`   Payload:`, JSON.stringify(strat.payload, null, 2));
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const res = await fetch(strat.url, {
            method: 'POST',
            headers: strat.headers,
            body: JSON.stringify(strat.payload),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          const responseText = await res.text();
          console.log(`   Status: ${res.status}`);
          console.log(`   Response: ${responseText.substring(0, 500)}`);
          
          if (res.ok) {
            try {
              const json = JSON.parse(responseText);
              
              // Verificar resposta da Paradise
              if (json.status === "success" && (json.qr_code || json.qr_code_base64)) {
                console.log(`✅ SUCESSO na: ${strat.name}`);
                successData = json;
                workingStrategy = strat;
                break;
              } else {
                console.log(`   ⚠️  Resposta da Paradise:`, json);
              }
            } catch (parseError) {
              console.log(`   ❌ Erro ao parsear JSON:`, parseError);
            }
          } else {
            console.log(`   ❌ HTTP ${res.status}: ${responseText}`);
          }
        } catch (e: any) {
          console.log(`   💥 Erro: ${e.message}`);
        }
      }
    } else {
      console.log("🔑 Chave API não configurada ou inválida");
    }

    // SE A PARADISE FUNCIONOU
    if (successData) {
      console.log(`🎉 Transação REAL criada via Paradise!`);
      
      const data = successData;
      const pixCopiaCola = data.qr_code;
      const qrCodeImage = data.qr_code_base64;
      const finalId = data.transaction_id || data.id || transactionId;

      // Salvar no Firebase
      if (db) {
        await safeSaveToFirestore(db, String(finalId), {
          status: 'created',
          provider: 'paradise_real',
          plan: plan || 'unknown',
          email: email,
          name: name,
          price: price,
          fbp: fbp || null,
          fbc: fbc || null,
          phone: phone,
          cpf: cpf,
          paradise_transaction_id: data.transaction_id,
          created_at: new Date().toISOString(),
          debug: debugInfo
        });
      }

      return NextResponse.json({
        id: finalId,
        qrCodeBase64: qrCodeImage,
        copiaECola: pixCopiaCola,
        provider: workingStrategy?.name,
        amount: data.amount / 100, // Converter de volta para reais
        expires_at: data.expires_at
      });
    }

    // SE PARADISE FALHOU, USAR MOCK MELHORADO
    console.log("🧪 Paradise falhou, criando mock...");
    
    // Mock mais realista
    const mockPixCode = generateValidPixCode({
      transactionId,
      price: Number(price),
      name: name.substring(0, 25),
    });
    
    const mockData = {
      id: transactionId,
      qrCodeBase64: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mockPixCode)}&format=png`,
      copiaECola: mockPixCode,
      provider: "MOCK_DEV - Configure Paradise",
      expiresIn: "24:00:00"
    };

    // Salvar no Firebase
    if (db) {
      await safeSaveToFirestore(db, transactionId, {
        status: 'created',
        provider: 'mock_development',
        plan: plan || 'unknown',
        email: email,
        name: name,
        price: price,
        fbp: fbp || null,
        fbc: fbc || null,
        phone: phone,
        cpf: cpf,
        created_at: new Date().toISOString(),
        isMock: true,
        debug: debugInfo
      });
    }

    return NextResponse.json({
      ...mockData,
      warning: "Configure PARADISE_SECRET_KEY e PARADISE_PRODUCT_HASH no .env",
      debug: debugInfo
    });

  } catch (error: any) {
    console.error('💥 Erro geral:', error);
    return NextResponse.json({ 
      error: 'Erro interno no servidor', 
      message: error.message
    }, { status: 500 });
  }
}

// Gerar PIX mock melhorado (apenas para dev)
function generateValidPixCode(params: {
  transactionId: string;
  price: number;
  name: string;
}): string {
  const { transactionId, price, name } = params;
  
  const amount = price.toFixed(2);
  const pixKey = "teste@paradise.com.br"; // Chave Pix fictícia
  
  // Payload PIX mais realista (mas ainda mock)
  return `00020126580014br.gov.bcb.pix0136${pixKey}52040000530398654${amount.length}${amount}5802BR5925${name.substring(0, 25)}6008Sao Paulo62290525${transactionId}6304E2A0`;
}
