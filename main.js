const icon = document.querySelector("header .burger");
const aside = document.querySelector("aside");


icon.onclick = _ => {
  aside.classList.toggle("open");
}
// قراءة كل استايلات الـ before المحسوبة
