const fs = require('fs');
const path = 'src/pages/dashboard/admin/formations.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';
const BT = String.fromCharCode(96);

const old =
  '                  <td>' + NL +
  '                    <form method="POST" action="/api/admin/formations/validate-payment" style="display:inline;">' + NL +
  '                      <input type="hidden" name="free_request_id" value={req.id} />' + NL +
  '                      <button type="submit" class="btn btn-primary btn-xs">Approuver</button>' + NL +
  '                    </form>' + NL +
  '                  </td>';

const newB =
  '                  <td>' + NL +
  '                    <div class="workshop-actions">' + NL +
  '                      <form method="POST" action="/api/admin/formations/validate-payment" style="display:inline;">' + NL +
  '                        <input type="hidden" name="free_request_id" value={req.id} />' + NL +
  '                        <input type="hidden" name="decision" value="APPROVE" />' + NL +
  '                        <button type="submit" class="btn btn-primary btn-xs" data-confirm={' + BT + 'Approuver la demande d exoneration de ${req.profiles?.full_name ?? "cet utilisateur"} ?' + BT + '}>Approuver</button>' + NL +
  '                      </form>' + NL +
  '                      <form method="POST" action="/api/admin/formations/validate-payment" style="display:inline;">' + NL +
  '                        <input type="hidden" name="free_request_id" value={req.id} />' + NL +
  '                        <input type="hidden" name="decision" value="REFUSE" />' + NL +
  '                        <input type="hidden" name="note" value="Demande d exoneration refusee" />' + NL +
  '                        <button type="submit" class="btn btn-ghost btn-xs" data-confirm={' + BT + 'Refuser la demande d exoneration de ${req.profiles?.full_name ?? "cet utilisateur"} ?' + BT + '}>Refuser</button>' + NL +
  '                      </form>' + NL +
  '                    </div>' + NL +
  '                  </td>';

if (!s.includes(old)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(old, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK 2.2 patch applied');
