ALTER TABLE "ApprovalAuthorizer"
ADD CONSTRAINT "ApprovalAuthorizer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
