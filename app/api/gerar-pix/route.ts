// app/api/gerar-pix/route.ts - VERSÃO DEFINITIVA
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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
  try {
    const body = await request.json();
    const { name, email, cpf, price, plan, phone } = body;
    const transactionId = crypto.randomUUID();

    // Inicializar Firebase
    const app = initFirebase();
    const db = app ? getFirestore(app) : null;
    
    const SECRET_KEY = process.env.PARADISE_SECRET_KEY;

    if (!SECRET_KEY) {
      return NextResponse.json({
        success: false,
        error: "Chave API não configurada",
        message: "Configure PARADISE_SECRET_KEY no .env"
      }, { status: 500 });
    }

    // 🎯 MAPEAMENTO DOS 3 PRODUTOS COM SEUS HASHES REAIS
    const productHashMap: { [key: string]: string } = {
      "Kit 3 Meses": "prod_d6a5ebe96b2eb490",  // ✅ 3 MESES
      "Kit 5 Meses": "prod_9dc131fea65a345d",  // ✅ 5 MESES  
      "Kit 12 Meses": "prod_c5e1a25852bd498a", // ✅ 12 MESES
    };

    const productHash = productHashMap[plan];

    if (!productHash) {
      return NextResponse.json({
        success: false,
        error: "Produto não encontrado",
        message: `Hash não configurado para o plano: ${plan}`
      }, { status: 400 });
    }

    // Payload CORRETO para Paradise API
    const paradisePayload = {
      amount: Math.round(Number(price) * 100), // EM CENTAVOS
      description: `${plan} - Zero Vicios`,
      reference: transactionId,
      postback_url: `${(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/webhook`,
      productHash: productHash,
      customer: {
        name: name.substring(0, 100),
        email: email,
        document: cpf.replace(/\D/g, ''),
        phone: phone ? phone.replace(/\D/g, '') : "11999999999"
      },
      tracking: {
        utm_source: "site",
        utm_medium: "direct",
        utm_campaign: "zero_vicios"
      }
    };

    console.log("🚀 PARADISE API - PIX REAL");
    console.log("Plano:", plan);
    console.log("Product Hash:", productHash);
    console.log("Valor (centavos):", paradisePayload.amount);

    const response = await fetch("https://multi.paradisepags.com/api/v1/transaction.php", {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-API-Key': SECRET_KEY
      },
      body: JSON.stringify(paradisePayload)
    });

    const responseText = await response.text();
    
    console.log("=== RESPOSTA PARADISE ===");
    console.log("Status:", response.status);
    console.log("Resposta:", responseText);
    console.log("=========================");

    // Processar resposta
    try {
      const data = JSON.parse(responseText);
      
      if (response.ok && data.status === "success") {
        console.log("✅ PIX REAL GERADO COM SUCESSO!");
        
        // Salvar no Firebase
        if (db) {
          await safeSaveToFirestore(db, String(data.transaction_id), {
            status: 'pending',
            provider: 'paradise',
            plan: plan,
            email: email,
            name: name,
            price: price,
            phone: phone,
            cpf: cpf,
            paradise_transaction_id: data.transaction_id,
            product_hash: productHash,
            created_at: new Date().toISOString(),
            pix_code: data.qr_code,
            expires_at: data.expires_at
          });
        }

        return NextResponse.json({
          success: true,
          id: data.transaction_id,
          qrCodeBase64: data.qr_code_base64,
          copiaECola: data.qr_code,
          provider: "Paradise",
          amount: data.amount / 100,
          expires_at: data.expires_at,
          message: "PIX real gerado com sucesso!"
        });

      } else {
        console.log("❌ Erro da Paradise:", data);
        return NextResponse.json({
          success: false,
          error: "Erro na API Paradise",
          details: data,
          debug: { 
            plan: plan,
            productHash: productHash
          }
        }, { status: 400 });
      }

    } catch (parseError) {
      console.log("❌ Erro ao parsear resposta:", parseError);
      return NextResponse.json({
        success: false,
        error: "Erro de comunicação com a Paradise",
        rawResponse: responseText,
        debug: { 
          plan: plan,
          productHash: productHash
        }
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error("💥 ERRO GRAVE:", error);
    return NextResponse.json({ 
      success: false,
      error: 'Erro interno no servidor',
      message: error.message 
    }, { status: 500 });
  }
}
