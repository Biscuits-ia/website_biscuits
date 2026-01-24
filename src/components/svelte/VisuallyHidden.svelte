<script>
  import { Dialog, DialogContent, DialogTitle } from 'bits-ui';
</script>

<Dialog.Root>
  <Dialog.Trigger>Ouvrir</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <!-- Titre visible -->
      <Dialog.Title>Biscuits IA</Dialog.Title>
      
      <!-- OU titre masqué visuellement -->
      <Dialog.Title class="sr-only">
        solution pour les Associations et PME/TPE
      </Dialog.Title>
      
      <!-- Votre contenu -->
      <p></p>
      
      <Dialog.Close>Fermer</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>