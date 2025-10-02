import { web3 } from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

export async function initAdminRegistry(program: Program, adminPda: web3.PublicKey) {
  const me = program.provider.wallet.publicKey;
  return program.methods
    .initAdminRegistry(me)
    .accounts({
      adminRegistry: adminPda,
      payer: me,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
}

export async function addAdmin(program: Program, adminPda: web3.PublicKey, newAdmin: string) {
  const pk = new web3.PublicKey(newAdmin);
  return program.methods
    .addAdmin(pk)
    .accounts({ adminRegistry: adminPda, superAdmin: program.provider.wallet.publicKey })
    .rpc();
}

export async function removeAdmin(program: Program, adminPda: web3.PublicKey, oldAdmin: string) {
  const pk = new web3.PublicKey(oldAdmin);
  return program.methods
    .removeAdmin(pk)
    .accounts({ adminRegistry: adminPda, superAdmin: program.provider.wallet.publicKey })
    .rpc();
}