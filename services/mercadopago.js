const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');

let client = null;

function initMercadoPago(accessToken) {
  client = new MercadoPagoConfig({ 
    accessToken: accessToken,
    options: { timeout: 5000 }
  });
  console.log('MercadoPago initialized');
}

async function createPixPayment(amount, description, payerEmail = 'cliente@sabiostore.com') {
  if (!client) {
    throw new Error('MercadoPago not initialized. Call initMercadoPago first.');
  }

  const payment = new Payment(client);
  
  const idempotencyKey = uuidv4();
  
  const paymentData = {
    transaction_amount: amount,
    description: description || `SábioStore - Adição de Saldo R$${amount.toFixed(2)}`,
    payment_method_id: 'pix',
    payer: {
      email: payerEmail,
    },
  };

  try {
    const response = await payment.create({ 
      body: paymentData,
      requestOptions: { idempotencyKey }
    });

    return {
      id: response.id,
      status: response.status,
      qr_code: response.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
    };
  } catch (error) {
    console.error('Error creating PIX payment:', error);
    throw error;
  }
}

async function checkPaymentStatus(paymentId) {
  if (!client) {
    throw new Error('MercadoPago not initialized');
  }

  const payment = new Payment(client);
  
  try {
    const response = await payment.get({ id: paymentId });
    return {
      id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      transaction_amount: response.transaction_amount,
    };
  } catch (error) {
    console.error('Error checking payment status:', error);
    throw error;
  }
}

module.exports = {
  initMercadoPago,
  createPixPayment,
  checkPaymentStatus,
};
