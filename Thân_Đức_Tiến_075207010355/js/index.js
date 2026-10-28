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