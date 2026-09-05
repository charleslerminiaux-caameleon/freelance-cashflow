type DatabaseError = {
  code: string;
  message: string;
};

export function onboardingErrorMessage(error: DatabaseError): string {
  if (error.code === "23505" && error.message === "OWNER_ALREADY_EXISTS") {
    return "Cette instance possède déjà un propriétaire.";
  }

  return "La configuration n’a pas pu être enregistrée.";
}
