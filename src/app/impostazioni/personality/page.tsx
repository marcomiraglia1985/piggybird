import { PersonalityTestClient } from "@/components/impostazioni/personality-test-client";
import { getPersonalityProfile } from "@/lib/personality";
import { getUserProfile } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

export default async function PersonalityPage() {
  const [profile, user] = await Promise.all([
    getPersonalityProfile(),
    getUserProfile(),
  ]);
  return (
    <PersonalityTestClient
      profile={profile}
      userCountry={user.countries[0] ?? null}
      userCity={user.city || null}
    />
  );
}
