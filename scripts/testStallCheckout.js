
// Native fetch is available in Node.js 18+

const API_URL = 'http://localhost:5000/api/payment/create';

const payload = {
    attendees: [
        {
            name: 'Test Stall User',
            email: 'stall@test.com',
            phone: '9876543210',
            startupName: 'Valid Startup',
            profession: '', // Should be allowed to be empty
            professionOther: ''
        }
    ],
    amount: 14160,
    quantity: 1,
    itemType: 'stall',
    stallType: '4 x 4 ft Exhibition Stall',
    stallId: 1,
    baseAmount: 12000,
    gstAmount: 2160
};

async function testCheckout() {
    try {
        console.log('🚀 Sending Stall Checkout Request...');
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Success:', data);
        } else {
            console.log('❌ Failed:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testCheckout();
