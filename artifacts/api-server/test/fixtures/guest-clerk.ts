/** Build-time fixture only. Never imported by the application. */
export const accountUsers = new Map<string, any>();
export let accountCreationFails = false;
export const setAccountCreationFails = (value: boolean) => { accountCreationFails = value; };
export const fakeClerk = {
  users: {
    async getUserList(query: any) {
      if (accountCreationFails) throw new Error("Isolated account provider unavailable");
      return { data: [...accountUsers.values()].filter((user) =>
        query.externalId ? query.externalId.includes(user.externalId)
          : query.emailAddress ? user.emailAddresses.some((email: any) => query.emailAddress.includes(email.emailAddress))
            : true) };
    },
    async createUser(input: any) {
      const user = {
        ...input, id: `user_isolated_${accountUsers.size}`,
        emailAddresses: input.emailAddress.map((emailAddress: string) => ({ emailAddress, verification: { status: "unverified" } })),
      };
      accountUsers.set(user.id, user);
      return user;
    },
  },
};
