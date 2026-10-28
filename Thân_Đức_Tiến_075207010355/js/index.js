const logo = document.querySelector(".logo-button");

if(logo){
    logo.addEventListener("click",function(e){
        e.preventDefault();
        document.querySelector(".hero").classList.add("leaving");
        
        setTimeout(function (){
            window.location.href = "about.html";
        },600);
    });
}
const stage = document.querySelector(".stage");
const STAGE_W = 1875; 
const STAGE_H = 925;

function fitStage() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let scale = Math.min(w / STAGE_W, h / STAGE_H); 
  if (h > w) {
    scale = w / 900; 
  }
  stage.style.setProperty("--scale", scale);
}

if (stage) {
  fitStage();
  window.addEventListener("resize", fitStage);
}