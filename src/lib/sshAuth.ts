/** The remote refused every ssh key on offer. */
export const isSshAuthFailure = (message: string) =>
	/Permission denied \([^)]*publickey/.test(message);
