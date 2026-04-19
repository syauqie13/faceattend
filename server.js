const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const app = express();

const DATA_FILE = path.join(__dirname, 'data_absensi.json');

// Helper untuk menyimpan data absensi ke file JSON
function saveAbsensi(nama, waktu, gambar) {
    let data = [];
    if (fs.existsSync(DATA_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            console.error("Gagal membaca file data absensi", e);
        }
    }
    data.push({ id: Date.now(), nama, waktu, gambar });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Menambahkan limit ukuran body parser agar bisa menerima string base64 gambar yang panjang
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Menyediakan akses statis ke file frontend (seperti index.html)
app.use(express.static(path.join(__dirname)));

// ==========================================
// 1. INISIALISASI WHATSAPP WEB CLIENT
// ==========================================
// LocalAuth akan menyimpan session ke folder .wwebjs_auth
// Sehingga saat restart server, tidak perlu scan QR lagi.
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Event ini dipanggil saat login membutuhkan scan QR Code
client.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('SCAN QR CODE DI BAWAH INI MENGGUNAKAN WHATSAPP HP:');
    console.log('==================================================\n');
    qrcode.generate(qr, { small: true });
});

// Event saat scan berhasil dan authentikasi disetujui
client.on('authenticated', () => {
    console.log('✅ WhatsApp Authenticated!');
});

// Event saat WhatsApp sudah siap mengirim dan menerima pesan
client.on('ready', () => {
    console.log('\n✅ WhatsApp Web Client is ready! Bot aktif.');
});

// Event jika terjadi kegagalan authentikasi
client.on('auth_failure', msg => {
    console.error('❌ Authentication failure', msg);
});

// Mulai inisialisasi Client
client.initialize();

// ==========================================
// 2. FUNGSI KIRIM WHATSAPP (Otomatis)
// ==========================================
/**
 * Fungsi untuk mengirim pesan WhatsApp ke Nomor Orang Tua
 * @param {string} nama - Nama Siswa
 * @param {string} nomorOrtu - Nomor HP Orang Tua (contoh: '081234567890' atau '628...')
 */
const sendWA = async (nama, nomorOrtu) => {
    try {
        // Membersihkan karakter selain angka (jika ada spasi, strip, dll)
        let formattedNumber = nomorOrtu.replace(/\D/g, '');

        // Memastikan format nomor menggunakan kode negara (62 untuk Indonesia)
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }

        // whatsapp-web.js membutuhkan postfix '@c.us' untuk identifikasi nomor kontak personal
        const chatId = `${formattedNumber}@c.us`;

        // Dapatkan waktu saat fungsi ini dipanggil
        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        // Format isi Pesan
        const message = `Halo, kami dari pihak sekolah.\n\nMenginformasikan bahwa ananda *${nama}* sudah hadir di sekolah pada *${timeString}*.\n\nTerima kasih.`;

        // Kirim pesan
        await client.sendMessage(chatId, message);
        console.log(`✅ Pesan WA berhasil terkirim ke orang tua ${nama} (No: ${formattedNumber})`);
    } catch (error) {
        console.error(`❌ Gagal mengirim pesan WA ke ${nomorOrtu}:`, error);
    }
};

// ==========================================
// 3. ENDPOINT API UNTUK ABSENSI FACE RECOGNITION
// ==========================================
// Endpoint ini akan di-"tembak" (POST) oleh index.html 
app.post('/absensi', async (req, res) => {
    try {
        const { image } = req.body; // 'image' berisi gambar Base64 dari webcam

        if (!image) {
            return res.status(400).json({ success: false, message: 'Gambar tidak ditemukan.' });
        }

        console.log('\n[SERVER] Menerima data absensi kamera dari browser...');

        // ------------------------------------------------------------------------
        // CATATAN PENTING UNTUK INTEGRASI LANJUTAN:
        // Di aplikasi sungguhan, Anda harus memproses 'image' (base64) ini
        // Menggunakan library Face Recognition Back-End (Python / face-api nodejs)
        // Untuk memverifikasi ID/Nama Siswa dari gambar yang dikirimkan.
        // Setelah Nama/ID didapat, Query Database untuk mengambil 'Nomor HP Orang Tua'.
        // ------------------------------------------------------------------------

        // SIMULASI: Anggap saja gambar tersebut terdeteksi sebagai "Budi Santoso"
        const dummyStudentName = "Zidan";
        const dummyParentPhone = "085973789395"; // <-- GANTI DENGAN NOMOR HP ANDA (UNTUK TESTING)

        // Dapatkan waktu saat ini
        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' - ' + now.toLocaleDateString('id-ID');

        // Simpan data absensi ke JSON
        saveAbsensi(dummyStudentName, timeString, image);

        // Panggil fungsi sendWA (Pastikan WhatsApp Web sudah status 'ready')
        await sendWA(dummyStudentName, dummyParentPhone);

        // Berikan respon kembali ke frontend (index.html)
        res.status(200).json({
            success: true,
            message: `Absensi untuk ${dummyStudentName} berhasil. Pesan WA terkirim.`
        });
    } catch (error) {
        console.error('[SERVER] Terjadi kesalahan saat memproses POST /absensi:', error);
        res.status(500).json({ success: false, message: 'Server backend mengalami error' });
    }
});

// Endpoint untuk mengambil seluruh data absensi (digunakan di panel admin)
app.get('/api/absensi', (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            res.json(data);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data' });
    }
});

// Endpoint untuk menghapus seluruh data absensi
app.delete('/api/absensi', (req, res) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: 'Data berhasil dibersihkan' });
    } catch (error) {
        console.error('[SERVER] Error membersihkan data:', error);
        res.status(500).json({ error: 'Gagal membersihkan data' });
    }
});

// ==========================================
// 4. JALANKAN SERVER
// ==========================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server Backend Node.js telah berjalan!`);
    console.log(`👉 Buka aplikasi di browser: http://localhost:${PORT}`);
    console.log(`\nProses memuat module WhatsApp Web. Mohon tunggu beberapa detik...`);
});
