(() => {
  const key='iphone-lab-macbook-id';
  const toggle=document.getElementById('remote-toggle');
  const body=document.getElementById('remote-body');
  function collapse(closed){body.hidden=closed;toggle.setAttribute('aria-expanded',String(!closed));toggle.textContent=closed?'Rozbaliť ⌄':'Zbaliť ⌃'}
  try{collapse(localStorage.getItem('iphone-lab-macbook-collapsed')!=='false')}catch{collapse(true)}
  toggle.addEventListener('click',()=>{collapse(!body.hidden);try{localStorage.setItem('iphone-lab-macbook-collapsed',String(body.hidden))}catch{}});

  const form=document.getElementById('remote-form');
  const input=document.getElementById('remote-id');
  const link=document.getElementById('remote-open');
  const status=document.getElementById('remote-status');
  const forget=document.getElementById('remote-forget');
  function render(id){
    input.value=id;
    link.hidden=!id;forget.hidden=!id;
    if(id)link.href='rustdesk://connection/new/'+id;
    else link.removeAttribute('href');
  }
  try{const saved=localStorage.getItem(key)||'';if(/^\d{6,16}$/.test(saved)){render(saved);status.textContent='MacBook je uložený. Otvorenie pokračuje v aplikácii RustDesk.'}}catch{}
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const id=input.value.replace(/\s/g,'');
    if(!/^\d{6,16}$/.test(id)){status.textContent='Zadaj číselné ID z aplikácie RustDesk na MacBooku.';return}
    render(id);
    try{localStorage.setItem(key,id);status.textContent='MacBook je uložený. Otvorenie pokračuje v aplikácii RustDesk.'}
    catch{status.textContent='ID je pripravené iba na toto otvorenie aplikácie.'}
  });
  forget.addEventListener('click',()=>{try{localStorage.removeItem(key)}catch{}render('');status.textContent='MacBook bol odstránený z tohto zariadenia.'});
  link.addEventListener('click',()=>{status.textContent='Otváram RustDesk. Ak sa neotvorí, nainštaluj ho na iPhone a zadaj rovnaké ID priamo v ňom.'});
})();
