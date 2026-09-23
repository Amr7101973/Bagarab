const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3000;

const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>YouTube Downloader</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 12px; width: 100%; max-width: 440px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    h2 { margin-top: 0; text-align: center; color: #38bdf8; }
    label { display: block; margin: 12px 0 4px; font-size: 0.9rem; color: #94a3b8; }
    input, select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 0.95rem; }
    .row { display: flex; gap: 10px; }
    .row div { flex: 1; }
    button { width: 100%; padding: 12px; margin-top: 20px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: bold; }
    button:hover { background: #0369a1; }
    #log { margin-top: 15px; padding: 10px; background: #0f172a; border-radius: 6px; font-size: 0.85rem; color: #38bdf8; white-space: pre-wrap; max-height: 140px; overflow-y: auto; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>منزّل مقاطع يوتيوب 🎬</h2>
    <form id="dlForm">
      <label>رابط الفيديو:</label>
      <input type="url" id="url" required placeholder="https://www.youtube.com/watch?v=...">

      <label>الجودة المطلوبة:</label>
      <select id="quality">
        <option value="max">أعلى جودة ممكنة (4K / 2K إن وُجدت)</option>
        <option value="1080" selected>1080p (Full HD - موصى بها)</option>
        <option value="720">720p (HD)</option>
        <option value="480">480p (SD - حجم خفيف)</option>
        <option value="360">360p (أقل حجم)</option>
      </select>

      <div class="row">
        <div>
          <label>البداية (اختياري):</label>
          <input type="text" id="start" placeholder="00:05:40">
        </div>
        <div>
          <label>النهاية (اختياري):</label>
          <input type="text" id="end" placeholder="00:06:26">
        </div>
      </div>

      <button type="submit" id="btn">بدء التحميل</button>
    </form>
    <div id="log"></div>
  </div>

  <script>
    const form = document.getElementById('dlForm');
    const btn = document.getElementById('btn');
    const log = document.getElementById('log');

    form.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = '⏳ جاري المعالجة والتحميل...';
      log.style.display = 'block';
      log.textContent = 'بدأ الطلب... جاري استخراج العنوان وبدء التنزيل.';

      const payload = {
        url: document.getElementById('url').value.trim(),
        quality: document.getElementById('quality').value,
        start: document.getElementById('start').value.trim(),
        end: document.getElementById('end').value.trim()
      };

      try {
        const res = await fetch('/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          log.textContent = '✅ اكتمل بنجاح!\\nتم حفظ الملف على سطح المكتب بالاسم الأصلي.';
        } else {
          log.textContent = '❌ خطأ: ' + data.error;
        }
      } catch (err) {
        log.textContent = '❌ فشل الاتصال بالسيرفر.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'بدء التحميل';
      }
    };
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_CONTENT);
    return;
  }

  if (req.method === 'POST' && req.url === '/download') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { url, start, end, quality } = JSON.parse(body);
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'الرابط مطلوب' }));
        }

        const isClip = Boolean(start && end);
        const desktopPath = path.join(process.env.USERPROFILE, 'Desktop');
        
        const cleanStart = start ? start.replace(/:/g, '-') : '';
        const cleanEnd = end ? end.replace(/:/g, '-') : '';
        
        const outputTemplate = isClip
          ? path.join(desktopPath, `%(title)s [${cleanStart} to ${cleanEnd}].%(ext)s`)
          : path.join(desktopPath, `%(title)s (${quality}p).%(ext)s`);

        const heightFilter = quality === 'max' ? '' : `[height<=${quality}]`;

        let args = [];
        if (isClip) {
          args = [
            '--download-sections', `*${start}-${end}`,
            '--force-keyframes-at-cuts',
            '-f', `bestvideo[protocol^=m3u8]${heightFilter}+bestaudio[protocol^=m3u8]/bestvideo${heightFilter}+bestaudio`,
            '--merge-output-format', 'mp4',
            '--postprocessor-args', 'ffmpeg:-c:v libx264 -c:a aac -avoid_negative_ts make_zero -fflags +genpts',
            '--windows-filenames',
            '--no-keep-video',
            '-o', outputTemplate,
            url
          ];
        } else {
          args = [
            '-f', `bestvideo${heightFilter}+bestaudio[ext=m4a]/bestvideo${heightFilter}+bestaudio/best`,
            '--merge-output-format', 'mp4',
            '--windows-filenames',
            '--no-keep-video',
            '-o', outputTemplate,
            url
          ];
        }

        console.log(`[بدء العملية] التنزيل والحفظ باسم الفيديو الأصلي إلى الديسكتوب`);
        
        // تشغيل مباشر بدون shell لمنع خطأ مسارات الويندوز
        const child = spawn('yt-dlp', args, { 
          shell: false,
          windowsHide: true
        });

        child.stdout.on('data', data => console.log(data.toString()));
        child.stderr.on('data', data => console.error(data.toString()));

        let isFinished = false;
        const finish = (code) => {
          if (isFinished) return;
          isFinished = true;
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `فشل التحميل، كود الخروج: ${code}` }));
          }
        };

        child.on('exit', (code) => finish(code));
        child.on('close', (code) => finish(code));

      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن!`);
  console.log(`🔗 افتح هذا الرابط في المتصفح: http://localhost:${PORT}`);
});