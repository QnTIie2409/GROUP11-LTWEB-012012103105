document.addEventListener('DOMContentLoaded', () => {
    // Tự động làm trong suốt nền đen (#000000) của file ảnh .jpg (camera.jpg và corner2.jpg)
    const removeBlackBackground = (imgElement, threshold = 28) => {
        const processImage = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = imgElement.naturalWidth || imgElement.width;
                canvas.height = imgElement.naturalHeight || imgElement.height;

                if (!canvas.width || !canvas.height) return;

                ctx.drawImage(imgElement, 0, 0);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    if (r < threshold && g < threshold && b < threshold) {
                        data[i + 3] = 0;
                    }
                }

                ctx.putImageData(imgData, 0, 0);
                imgElement.src = canvas.toDataURL('image/png');
            } catch (err) {
                // Dự phòng khi mở trực tiếp qua file:// trên trình duyệt
                imgElement.style.mixBlendMode = 'screen';
            }
        };

        if (imgElement.complete && imgElement.naturalWidth > 0) {
            processImage();
        } else {
            imgElement.addEventListener('load', processImage, { once: true });
        }
    };

    document.querySelectorAll('.remove-black-bg').forEach(img => {
        removeBlackBackground(img);
    });
});