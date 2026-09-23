const encoder=new TextEncoder();
const sha1=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();

export async function isPwnedPassword(password:string){
  const digest=await sha1(password),prefix=digest.slice(0,5),suffix=digest.slice(5);
  const response=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`,{
    headers:{'Add-Padding':'true','User-Agent':'suomi-satztrainer-password-check'},
    signal:AbortSignal.timeout(4000)
  });
  if(!response.ok)throw new Error('Pwned Passwords unavailable');
  const matches=(await response.text()).split(/\r?\n/);
  return matches.some(line=>{const [candidate,count]=line.split(':');return candidate===suffix&&Number(count)>0;});
}
