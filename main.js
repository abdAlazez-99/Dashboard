document.addEventListener("DOMContentLoaded", () => {
  // الألوان الأساسية للقالب
  const COLORS = {
    text: "#6C7293",
    grid: "#000000",
    primary: "#EB1616",
    cardBg: "#191C24",
    white: "#FFFFFF",
  };

  // إنشاء عنصر الـ Tooltip مرة واحدة في الصفحة
  const tooltip = document.createElement("div");
  Object.assign(tooltip.style, {
    position: "fixed",
    pointerEvents: "none",
    background: "rgba(0, 0, 0, 0.9)",
    color: COLORS.white,
    border: `1px solid ${COLORS.primary}`,
    borderRadius: "5px",
    padding: "6px 10px",
    fontSize: "12px",
    fontFamily: '"Open Sans", sans-serif',
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.15s ease",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(tooltip);

  // دالة تجهيز الـ Canvas ودعم الشاشات عالية الدقة (Retina / DPR)
  function setupCanvas(canvas, aspectRatio = 2) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    const width = canvas.clientWidth || 500;
    const height = Math.round(width / aspectRatio);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.font = '12px "Open Sans", sans-serif';
    return { ctx, width, height };
  }

  // دالة رسم مفتاح الألوان (Legend) أعلى الرسم
  function drawLegend(ctx, width, items) {
    const boxW = 28;
    const boxH = 11;
    const gap = 16;
    let totalW = 0;

    items.forEach((item) => {
      totalW += boxW + 6 + ctx.measureText(item.label).width + gap;
    });
    totalW -= gap;

    let x = (width - totalW) / 2;
    const y = 12;

    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, x + boxW + 6, y + boxH / 2 + 1);
      x += boxW + 6 + ctx.measureText(item.label).width + gap;
    });
  }

  // دالة رسم الشبكة والمحاور (X & Y Axes)
  function drawGrid(
    ctx,
    area,
    labels,
    yMin,
    yMax,
    yStep,
    centerXLabels = false,
  ) {
    const { left, top, right, bottom } = area;
    const w = right - left;
    const h = bottom - top;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px "Open Sans", sans-serif';

    // خطوط أفقية وأرقام المحور Y
    for (let val = yMin; val <= yMax; val += yStep) {
      const ratio = (val - yMin) / (yMax - yMin);
      const y = bottom - ratio * h;

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(val, left - 8, y);
    }

    // خطوط رأسية وأسماء المحور X
    const count = labels.length;
    const cols = centerXLabels ? count : count - 1;
    const stepX = w / cols;

    for (let i = 0; i <= cols; i++) {
      const x = left + i * stepX;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    labels.forEach((label, i) => {
      const x = centerXLabels ? left + (i + 0.5) * stepX : left + i * stepX;
      ctx.fillText(label, x, bottom + 8);
    });

    return { stepX };
  }

  // ربط أحداث الماوس لعرض الـ Tooltip عند التمرير
  function attachHover(canvas, hitRegions) {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found = null;
      for (let i = hitRegions.length - 1; i >= 0; i--) {
        const reg = hitRegions[i];
        if (reg.type === "rect") {
          if (
            mx >= reg.x &&
            mx <= reg.x + reg.w &&
            my >= reg.y &&
            my <= reg.y + reg.h
          ) {
            found = reg;
            break;
          }
        } else if (reg.type === "circle") {
          const dist = Math.hypot(mx - reg.x, my - reg.y);
          if (dist <= reg.r) {
            found = reg;
            break;
          }
        } else if (reg.type === "arc") {
          const dist = Math.hypot(mx - reg.cx, my - reg.cy);
          if (dist >= reg.innerR && dist <= reg.outerR) {
            let angle = Math.atan2(my - reg.cy, mx - reg.cx);
            if (angle < -Math.PI / 2) angle += Math.PI * 2;
            if (angle >= reg.startAngle && angle <= reg.endAngle) {
              found = reg;
              break;
            }
          }
        }
      }

      if (found) {
        canvas.style.cursor = "pointer";
        tooltip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:${found.color};margin-right:6px;border-radius:2px;"></span><strong>${found.title}</strong>: ${found.value}`;
        tooltip.style.left = `${e.clientX + 12}px`;
        tooltip.style.top = `${e.clientY - 28}px`;
        tooltip.style.opacity = "1";
      } else {
        canvas.style.cursor = "default";
        tooltip.style.opacity = "0";
      }
    };

    canvas.onmouseleave = () => {
      tooltip.style.opacity = "0";
    };
  }

  // =========================================================
  // 1 & 4: دالة رسم الـ Bar Charts (فردي أو مجمّع)
  // =========================================================
  function renderBarChart(
    canvasId,
    { labels, datasets, yMax, yStep, showLegend = true },
  ) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = setupCanvas(canvas, 2);
    const area = {
      left: 42,
      top: showLegend ? 40 : 20,
      right: width - 15,
      bottom: height - 28,
    };
    const h = area.bottom - area.top;

    if (showLegend) {
      drawLegend(
        ctx,
        width,
        datasets.map((d) => ({ label: d.label, color: d.color })),
      );
    }

    const { stepX } = drawGrid(ctx, area, labels, 0, yMax, yStep, true);
    const hitRegions = [];
    const numSets = datasets.length;
    const groupWidth = stepX * 0.72;
    const gap = numSets > 1 ? 3 : 0;
    const barWidth = (groupWidth - gap * (numSets - 1)) / numSets;

    labels.forEach((lbl, i) => {
      const slotCenter = area.left + (i + 0.5) * stepX;
      const startX = slotCenter - groupWidth / 2;

      datasets.forEach((ds, dIdx) => {
        const val = ds.data[i];
        const color = Array.isArray(ds.color) ? ds.color[i] : ds.color;
        const barH = (val / yMax) * h;
        const x = startX + dIdx * (barWidth + gap);
        const y = area.bottom - barH;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth, barH);

        hitRegions.push({
          type: "rect",
          x,
          y,
          w: barWidth,
          h: barH,
          title: ds.label ? `${ds.label} (${lbl})` : lbl,
          value: val,
          color,
        });
      });
    });

    attachHover(canvas, hitRegions);
  }

  // =========================================================
  // 2 & 3: دالة رسم الـ Line & Area Charts
  // =========================================================
  function renderLineChart(canvasId, { labels, datasets, yMin, yMax, yStep }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = setupCanvas(canvas, 2);
    const area = { left: 42, top: 40, right: width - 15, bottom: height - 28 };
    const h = area.bottom - area.top;

    drawLegend(
      ctx,
      width,
      datasets.map((d) => ({ label: d.label, color: d.color })),
    );
    const { stepX } = drawGrid(ctx, area, labels, yMin, yMax, yStep, false);
    const hitRegions = [];

    // رسم المساحات والخطوط (نرسم من الأخير للأول عشان البيانات الأصغر تبان فوق)
    [...datasets].reverse().forEach((ds) => {
      const points = ds.data.map((val, i) => ({
        x: area.left + i * stepX,
        y: area.bottom - ((val - yMin) / (yMax - yMin)) * h,
        val,
        label: labels[i],
      }));

      // تعبئة المساحة تحت الخط لو fill: true
      if (ds.fill) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, area.bottom);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, area.bottom);
        ctx.closePath();
        ctx.fillStyle = ds.color;
        ctx.fill();
      }

      // رسم الخط نفسه
      ctx.beginPath();
      points.forEach((p, idx) =>
        idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.strokeStyle = COLORS.primary;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // رسم النقط وتجهيز الـ Hover
      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.primary;
        ctx.fill();

        hitRegions.push({
          type: "circle",
          x: p.x,
          y: p.y,
          r: 8,
          title: `${ds.label} (${p.label})`,
          value: p.val,
          color: COLORS.primary,
        });
      });
    });

    attachHover(canvas, hitRegions);
  }

  // =========================================================
  // 5 & 6: دالة رسم الـ Pie & Doughnut Charts
  // =========================================================
  function renderRadialChart(
    canvasId,
    { labels, data, colors, isDoughnut = false },
  ) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = setupCanvas(canvas, 1.7);
    drawLegend(
      ctx,
      width,
      labels.map((lbl, i) => ({ label: lbl, color: colors[i] })),
    );

    const total = data.reduce((sum, v) => sum + v, 0);
    const cx = width / 2;
    const cy = height / 2 + 16;
    const outerR = Math.min(width, height - 50) * 0.42;
    const innerR = isDoughnut ? outerR * 0.5 : 0;
    const hitRegions = [];

    let startAngle = -Math.PI / 2; // البداية من الساعة 12

    data.forEach((val, i) => {
      const sliceAngle = (val / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const pct = ((val / total) * 100).toFixed(1);

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      if (isDoughnut) {
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      } else {
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();

      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      hitRegions.push({
        type: "arc",
        cx,
        cy,
        innerR,
        outerR,
        startAngle,
        endAngle,
        title: labels[i],
        value: `${val} (${pct}%)`,
        color: colors[i],
      });

      startAngle = endAngle;
    });

    attachHover(canvas, hitRegions);
  }

  // =========================================================
  // تشغيل ورسم كل الـ 6 Charts بنفس بيانات القالب
  // =========================================================
  function drawAllCharts() {
    const countryLabels = ["Italy", "France", "Spain", "USA", "Argentina"];
    const countryData = [55, 49, 44, 24, 15];
    const countryColors = [
      "rgba(235, 22, 22, 0.7)",
      "rgba(235, 22, 22, 0.6)",
      "rgba(235, 22, 22, 0.5)",
      "rgba(235, 22, 22, 0.4)",
      "rgba(235, 22, 22, 0.3)",
    ];

    // 1. Worldwide Sales (الصفحة الرئيسية + صفحة Charts)
    renderBarChart("worldwide-sales", {
      labels: ["2016", "2017", "2018", "2019", "2020", "2021", "2022"],
      yMax: 100,
      yStep: 20,
      datasets: [
        {
          label: "USA",
          data: [15, 30, 55, 65, 60, 80, 95],
          color: "rgba(235, 22, 22, 0.7)",
        },
        {
          label: "UK",
          data: [8, 35, 40, 60, 70, 55, 75],
          color: "rgba(235, 22, 22, 0.5)",
        },
        {
          label: "AU",
          data: [12, 25, 45, 55, 65, 70, 60],
          color: "rgba(235, 22, 22, 0.3)",
        },
      ],
    });

    // 2. Sales & Revenue (الصفحة الرئيسية + صفحة Charts)
    renderLineChart("salse-revenue", {
      labels: ["2016", "2017", "2018", "2019", "2020", "2021", "2022"],
      yMin: 0,
      yMax: 300,
      yStep: 50,
      datasets: [
        {
          label: "Sales",
          data: [15, 30, 55, 45, 70, 65, 85],
          color: "rgba(235, 22, 22, 0.7)",
          fill: true,
        },
        {
          label: "Revenue",
          data: [99, 135, 170, 130, 190, 180, 270],
          color: "rgba(235, 22, 22, 0.5)",
          fill: true,
        },
      ],
    });

    // 3. Single Line Chart (صفحة Charts)
    renderLineChart("line-chart", {
      labels: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
      yMin: 6,
      yMax: 16,
      yStep: 2,
      datasets: [
        {
          label: "Sales",
          data: [7, 8, 8, 9, 9, 9, 10, 11, 14, 14, 15],
          color: "rgba(235, 22, 22, 0.7)",
          fill: false,
        },
      ],
    });

    // 4. Single Bar Chart (صفحة Charts)
    renderBarChart("bar-chart", {
      labels: countryLabels,
      yMax: 60,
      yStep: 10,
      showLegend: false,
      datasets: [{ data: countryData, color: countryColors }],
    });

    // 5. Pie Chart (صفحة Charts)
    renderRadialChart("pie-chart", {
      labels: countryLabels,
      data: countryData,
      colors: countryColors,
      isDoughnut: false,
    });

    // 6. Doughnut Chart (صفحة Charts)
    renderRadialChart("doughnut-chart", {
      labels: countryLabels,
      data: countryData,
      colors: countryColors,
      isDoughnut: true,
    });
  }

  // الرسم عند تحميل الصفحة + إعادة الرسم تلقائياً عند تغيير حجم الشاشة
  drawAllCharts();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawAllCharts, 100);
  });
});
