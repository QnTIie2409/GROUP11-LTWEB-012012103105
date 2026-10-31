/**
 * FILE XỬ LÝ TƯƠNG TÁC TRANG ABOUT ME - NGÔ KHÁNH NGUYÊN
 * Bao gồm 5 chức năng tương tác (Không sử dụng Dark Mode):
 * 1. Khử nền đen tự động cho ảnh .jpg (camera.jpg, pinitem.jpg) bằng Canvas
 * 2. Menu Mobile (Hamburger Menu)
 * 3. Tabs chuyển đổi nội dung Hồ sơ & Định hướng
 * 4. Bộ lọc dự án (Project Filter)
 * 5. Modal chi tiết Dự án & Đam mê + Kiểm tra Form liên hệ + Nút Scroll-to-Top
 */

document.addEventListener("DOMContentLoaded", () => {

    /* ======================================================================
       1. TỰ ĐỘNG KHỬ NỀN ĐEN CỦA FILE CAMERA.JPG & PINITEM.JPG (SÁNG TẠO)
       ====================================================================== */
    function removeBlackBackground(imgElement, threshold = 30) {
        if (!imgElement) return;
        const process = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const w = imgElement.naturalWidth;
                const h = imgElement.naturalHeight;
                if (!w || !h) return;

                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(imgElement, 0, 0);

                const imgData = ctx.getImageData(0, 0, w, h);
                const data = imgData.data;
                const visited = new Uint8Array(w * h);
                const stack = [0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1)];

                // Thuật toán Flood-fill từ 4 góc để chỉ xóa nền đen bên ngoài, giữ nguyên chi tiết bên trong
                while (stack.length > 0) {
                    const idx = stack.pop();
                    if (visited[idx]) continue;
                    visited[idx] = 1;

                    const p = idx * 4;
                    const r = data[p], g = data[p + 1], b = data[p + 2];
                    if (r <= threshold && g <= threshold && b <= threshold) {
                        data[p + 3] = 0; // Làm trong suốt pixel nền đen
                        const x = idx % w;
                        const y = Math.floor(idx / w);
                        if (x > 0) stack.push(idx - 1);
                        if (x < w - 1) stack.push(idx + 1);
                        if (y > 0) stack.push(idx - w);
                        if (y < h - 1) stack.push(idx + w);
                    }
                }

                ctx.putImageData(imgData, 0, 0);
                imgElement.src = canvas.toDataURL("image/png");
            } catch (err) {
                // Nếu mở trực tiếp qua giao thức file:// bị giới hạn CORS, giữ nguyên hiển thị mặc định
            }
        };

        if (imgElement.complete) {
            process();
        } else {
            imgElement.addEventListener("load", process, { once: true });
        }
    }

    removeBlackBackground(document.getElementById("cameraImg"), 35);
    removeBlackBackground(document.getElementById("pinImg"), 28);

    /* ======================================================================
       2. CHỨC NĂNG TƯƠNG TÁC 1: MENU MOBILE (HAMBURGER MENU)
       ====================================================================== */
    const menuToggle = document.getElementById("menuToggle");
    const navLinks = document.getElementById("navLinks");
    const navItems = document.querySelectorAll(".nav-link");

    if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", () => {
            const isExpanded = navLinks.classList.toggle("show");
            menuToggle.setAttribute("aria-expanded", isExpanded);
        });

        navItems.forEach((link) => {
            link.addEventListener("click", () => {
                navLinks.classList.remove("show");
                menuToggle.setAttribute("aria-expanded", "false");
                navItems.forEach((item) => item.classList.remove("active"));
                link.classList.add("active");
            });
        });
    }

    /* ======================================================================
       3. CHỨC NĂNG TƯƠNG TÁC 2: TABS CHUYỂN ĐỔI NỘI DUNG
       ====================================================================== */
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-tab");

            tabBtns.forEach((b) => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            tabPanels.forEach((panel) => panel.classList.remove("active"));

            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) targetPanel.classList.add("active");
        });
    });

    /* ======================================================================
       4. CHỨC NĂNG TƯƠNG TÁC 3: BỘ LỌC DỰ ÁN (PROJECT FILTER)
       ====================================================================== */
    const filterBtns = document.querySelectorAll(".filter-btn");
    const projectCards = document.querySelectorAll(".project-card");

    filterBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const filterValue = btn.getAttribute("data-filter");

            filterBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            projectCards.forEach((card) => {
                const category = card.getAttribute("data-category");
                if (filterValue === "all" || filterValue === category) {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        });
    });

    /* ======================================================================
       5. CHỨC NĂNG TƯƠNG TÁC 4: MODAL CHI TIẾT DỰ ÁN & STICKER ĐAM MÊ
       ====================================================================== */
    const modal = document.getElementById("infoModal");
    const modalClose = document.getElementById("modalClose");
    const modalBadge = document.getElementById("modalBadge");
    const modalTitle = document.getElementById("modalTitle");
    const modalDesc = document.getElementById("modalDesc");
    const modalMeta = document.getElementById("modalMeta");

    const modalData = {
        camera: {
            badge: "Đam mê Quay chụp",
            title: "Nhiếp Ảnh & Dựng Video Ngắn",
            desc: "Quay chụp và biên tập những thước phim đời thường hay video ngắn trên CapCut PC giúp mình lưu giữ kỷ niệm và rèn luyện tư duy thẩm mỹ cho việc thiết kế giao diện web.",
            meta: "Công cụ yêu thích: Điện thoại, Máy ảnh & CapCut PC"
        },
        star: {
            badge: "Hoài bão tuổi 19",
            title: "Tập Trung Vào Con Đường IT",
            desc: "Mang trong mình rất nhiều đam mê nghệ thuật và thể thao, mình chọn tập trung theo đuổi ngành Công nghệ Thông tin để tạo dựng nền tảng tài chính vững chắc, nuôi dưỡng trọn vẹn những đam mê khác.",
            meta: "Định hướng: Front-End / Full-Stack Web Developer"
        },
        football: {
            badge: "Đam mê Thể thao",
            title: "Bóng Đá, Bóng Chuyền & Vũ Đạo",
            desc: "Thể thao và vũ đạo (Verdancy Cheerleading Squad) giúp mình duy trì năng lượng tích cực, tinh thần đồng đội và sự bền bỉ sau những giờ học lập trình căng thẳng.",
            meta: "Hoạt động: Bóng đá, Bóng chuyền, Chạy bộ & Cheerleading"
        },
        guitar: {
            badge: "Đam mê Âm nhạc",
            title: "Ca Hát, Guitar & Sản Xuất Nhạc",
            desc: "Âm nhạc là nơi mình giải tỏa cảm xúc. Mình yêu thích ca hát, đệm đàn Guitar và thử sức phối khí các bản nhạc cá nhân trên FL Studio & BandLab.",
            meta: "Nhạc cụ & Phần mềm: Acoustic/Electric Guitar, FL Studio, BandLab"
        },
        project1: {
            badge: "Dự án Web App",
            title: "Habit-Wealth-Loop Dashboard",
            desc: "Ứng dụng kết hợp việc rèn luyện thói quen mỗi ngày (theo dõi chuỗi streak tuần) với quản lý tài chính cá nhân. Hỗ trợ lưu trữ LocalStorage và trải nghiệm mượt mà như ứng dụng gốc (PWA).",
            meta: "Công nghệ: HTML5, CSS3, JavaScript, Node.js, LocalStorage"
        },
        project2: {
            badge: "Dự án UI/UX",
            title: "Scrapbook Personal & Team Portfolio",
            desc: "Website Portfolio cá nhân thiết kế theo phong cách cắt dán (Scrapbook) kết nối trực tiếp với trang chủ index.html của nhóm, đáp ứng đầy đủ tiêu chuẩn Semantic HTML và Responsive.",
            meta: "Công nghệ: HTML5, CSS3 (Grid/Flexbox), Vanilla JavaScript"
        },
        project3: {
            badge: "Dự án Cộng đồng",
            title: "Chiến Dịch Giáng Sinh Cho Em",
            desc: "Xây dựng kế hoạch truyền thông và trang thông tin quyên góp, kết nối các tình nguyện viên nhằm mang lại mùa Giáng sinh ấm áp cho các em nhỏ có hoàn cảnh khó khăn.",
            meta: "Vai trò: Ban tổ chức & Thiết kế trang thông tin"
        }
    };

    function openModal(key) {
        const item = modalData[key];
        if (!item || !modal) return;
        modalBadge.textContent = item.badge;
        modalTitle.textContent = item.title;
        modalDesc.textContent = item.desc;
        modalMeta.textContent = item.meta;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    document.querySelectorAll("[data-hobby]").forEach((el) => {
        el.addEventListener("click", () => openModal(el.getAttribute("data-hobby")));
    });

    document.querySelectorAll("[data-project]").forEach((el) => {
        el.addEventListener("click", () => openModal(el.getAttribute("data-project")));
    });

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }

    /* ======================================================================
       6. CHỨC NĂNG TƯƠNG TÁC 5: NÚT CUỘN LÊN ĐẦU TRANG (SCROLL TO TOP)
       ====================================================================== */
    const scrollTopBtn = document.getElementById("scrollTopBtn");

    window.addEventListener("scroll", () => {
        if (!scrollTopBtn) return;
        if (window.scrollY > 320) {
            scrollTopBtn.classList.add("visible");
        } else {
            scrollTopBtn.classList.remove("visible");
        }
    });

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    /* ======================================================================
       7. KIỂM TRA DỮ LIỆU FORM LIÊN HỆ (TIÊU CHÍ 15: FORM VALIDATION)
       ====================================================================== */
    const contactForm = document.getElementById("contactForm");

    if (contactForm) {
        contactForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const fullName = document.getElementById("fullName").value.trim();
            const email = document.getElementById("email").value.trim();
            const subject = document.getElementById("subject").value;
            const message = document.getElementById("message").value.trim();

            const nameError = document.getElementById("nameError");
            const emailError = document.getElementById("emailError");
            const subjectError = document.getElementById("subjectError");
            const messageError = document.getElementById("messageError");
            const formSuccess = document.getElementById("formSuccess");

            // Xóa thông báo lỗi cũ
            nameError.textContent = "";
            emailError.textContent = "";
            subjectError.textContent = "";
            messageError.textContent = "";
            formSuccess.hidden = true;

            let isValid = true;

            if (fullName.length < 2) {
                nameError.textContent = "Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).";
                isValid = false;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                emailError.textContent = "Vui lòng nhập đúng định dạng địa chỉ Email.";
                isValid = false;
            }

            if (!subject) {
                subjectError.textContent = "Vui lòng chọn một chủ đề liên hệ.";
                isValid = false;
            }

            if (message.length < 10) {
                messageError.textContent = "Nội dung tin nhắn cần có ít nhất 10 ký tự.";
                isValid = false;
            }

            if (isValid) {
                formSuccess.textContent = `Cảm ơn ${fullName}! Tin nhắn của bạn đã được gửi thành công đến Ngô Khánh Nguyên.`;
                formSuccess.hidden = false;
                contactForm.reset();
            }
        });
    }
});