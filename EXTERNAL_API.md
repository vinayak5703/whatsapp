# External Software → WhatsApp API

या shop साठी एकच WhatsApp number sender आहे. बाहेरचे ERP, billing किंवा order software या API चा उपयोग करून ग्राहकाला message पाठवू शकते.

## 1. 30 दिवसांचा token घ्या

```http
POST https://YOUR-DOMAIN/api/auth/login
Content-Type: application/json
```

```json
{
  "email": "shop-owner@example.com",
  "password": "your-password"
}
```

Response मधील `token` 30 दिवसांसाठी valid असतो. तो दुसऱ्या software च्या server-side secret/configuration मध्ये ठेवा; browser किंवा public frontend मध्ये ठेवू नका.

## 2. ग्राहकाला message पाठवा

```http
POST https://YOUR-DOMAIN/api/whatsapp/send
Authorization: Bearer YOUR_30_DAY_TOKEN
Content-Type: application/json
```

```json
{
  "message": "नमस्कार राहुल, तुमची order confirm झाली आहे.",
  "recipients": [
    {
      "name": "Rahul",
      "id": "919876543210@c.us",
      "type": "contact"
    }
  ]
}
```

फोन number च्या सुरुवातीला country code आवश्यक आहे. भारतासाठी `91`, आणि शेवटी `@c.us` आवश्यक आहे. उदाहरण: `919876543210@c.us`.

## Flow

```text
Order/Billing software → Bearer token validate → WhatsApp API → Shop WhatsApp number → Customer number
```

`/api/whatsapp/send` ला token शिवाय request केल्यास `401` error मिळतो. Token संपल्यावर पुन्हा login करून नवीन token घ्या.

WhatsApp नंबर जोडलेला नसल्यास आधी dashboard मधून Settings → Connect करून QR scan करणे आवश्यक आहे.

## Billing / Sales Order software साठी सोपा automatic API

Order किंवा invoice save झाल्यावर दुसऱ्या software ने हा API त्याच्या **backend/server** मधून call करावा. तुमच्या dashboard मधून Send क्लिक करण्याची गरज नाही.

```http
POST https://YOUR-DOMAIN/api/integration/whatsapp/send
Authorization: Bearer YOUR_30_DAY_TOKEN
Content-Type: application/json
```

```json
{
  "customerName": "Rahul Patil",
  "phone": "+91 98765 43210",
  "reference": "INV-2026-00125",
  "message": "नमस्कार Rahul, तुमचे invoice INV-2026-00125 तयार झाले आहे. धन्यवाद."
}
```

`phone` मध्ये country code आवश्यक आहे. `+`, space आणि `-` चालतील; API ते आपोआप काढून WhatsApp format बनवते. Success response मध्ये `success: true` आणि `sentAt` येईल. `409` म्हणजे WhatsApp QR/session अजून connected नाही; `401` म्हणजे token invalid किंवा expired आहे.

### Image, video, PDF किंवा document पाठवणे

File पाठवायची असल्यास हाच URL `multipart/form-data` ने call करा. Field names: `phone`, `message`, `customerName`, `reference`, आणि एक किंवा अनेक `attachments`. `message` पहिल्या file चा WhatsApp caption होतो. प्रति file कमाल size 25 MB आहे.

```bash
curl -X POST https://YOUR-DOMAIN/api/integration/whatsapp/send \
  -H "Authorization: Bearer YOUR_30_DAY_TOKEN" \
  -F "phone=+919876543210" \
  -F "message=तुमचे invoice आणि product video खाली दिले आहेत." \
  -F "attachments=@invoice.pdf" \
  -F "attachments=@product-video.mp4" \
  -F "attachments=@product-image.jpg"
```

## 3. WhatsApp वर आलेला message ERP कडे automatic पाठवा

`.env` मध्ये खालील server-side values द्या आणि server restart करा:

```env
INCOMING_WEBHOOK_URL=https://YOUR-ERP-DOMAIN/api/webhooks/whatsapp
INCOMING_WEBHOOK_SECRET=a-long-random-secret
```

यानंतर customer कडून आलेल्या प्रत्येक WhatsApp message साठी तुमचा server ERP URL वर JSON `POST` करेल. Payload मध्ये `event`, `occurredAt`, आणि `message.from`, `message.to`, `message.body`, `message.type`, `message.hasMedia` fields असतील. ERP ने `X-Webhook-Signature` मधील `sha256=<hash>` HMAC-SHA256 signature तपासावी. Server कडून पाठवलेले (`fromMe`) आणि status messages forward होत नाहीत.

## Customer-wise पुढची architecture

सध्याचा deployment **एक sender WhatsApp session** वापरतो. JWT मधील `customerId` हा login user ID वरून server ने तयार होतो; request मधून customer ID accept होत नाही.

Customer A/B/C साठी वेगवेगळे sender WhatsApp numbers हवे असतील, तेव्हा `customers` आणि `api_keys` table, hashed/revocable API keys, आणि `customerId -> LocalAuth session` अशी multi-session client manager layer लागेल. त्या बदलाशिवाय सर्व customer requests सध्याच्या एकाच connected WhatsApp number वरूनच जातील.
