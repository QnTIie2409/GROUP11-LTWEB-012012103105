 const To_top = document.querySelector(".Up-button");

 if(To_top){
    To_top.addEventListener("click",function(){
        window.scrollTo({top:0,behavior: "smooth"});
    });
 }