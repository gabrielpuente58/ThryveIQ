import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../constants/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
const STRAVA_REDIRECT_URI = "thryveiq://localhost/strava-callback";
const STRAVA_SCOPE = "activity:read_all";

interface Profile {
  goal: string;
  race_date: string;
  experience: string;
  weekly_hours: number;
  days_available: number;
  strongest_discipline: string;
  weakest_discipline: string;
}

interface EditDraft {
  goal: string;
  experience: string;
  weekly_hours: string;
  days_available: string;
  strongest_discipline: string;
  weakest_discipline: string;
  race_date: string;
}

const LABELS: Record<string, string> = {
  first_timer: "First Timer",
  recreational: "Recreational",
  competitive: "Competitive",
  swim: "Swim",
  bike: "Bike",
  run: "Run",
};

const SPORT_COLORS: Record<string, string> = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
};

const GOAL_OPTIONS = ["first_timer", "recreational", "competitive"] as const;
const DISCIPLINE_OPTIONS = ["swim", "bike", "run"] as const;

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(dateStr);
  return Math.max(0, Math.round((race.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function profileToDraft(p: Profile): EditDraft {
  return {
    goal: p.goal,
    experience: p.experience,
    weekly_hours: String(p.weekly_hours),
    days_available: String(p.days_available),
    strongest_discipline: p.strongest_discipline,
    weakest_discipline: p.weakest_discipline,
    race_date: p.race_date,
  };
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stravaAthlete, setStravaAthlete] = useState<{ name: string; id: number } | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/profiles/${user.id}`)
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${API_URL}/strava/status?user_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.athlete_name) {
          setStravaAthlete({ name: data.athlete_name, id: data.athlete_id });
        }
      })
      .catch(() => {});
  }, [user]);

  const handleConnectStrava = async () => {
    if (!user) return;
    setStravaLoading(true);
    try {
      const authUrl =
        `https://www.strava.com/oauth/authorize` +
        `?client_id=${STRAVA_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${STRAVA_SCOPE}` +
        `&approval_prompt=auto`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, STRAVA_REDIRECT_URI);

      if (result.type !== "success") return;

      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("No code returned from Strava");

      const res = await fetch(`${API_URL}/strava/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, code }),
      });
      if (!res.ok) throw new Error("Exchange failed");

      const data = await res.json();
      setStravaAthlete({ name: data.athlete_name, id: data.athlete_id });
    } catch {
      Alert.alert("Error", "Could not connect Strava. Please try again.");
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    if (!user) return;
    Alert.alert("Disconnect Strava", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await fetch(`${API_URL}/strava/disconnect?user_id=${user.id}`, { method: "DELETE" });
          setStravaAthlete(null);
        },
      },
    ]);
  };

  const handleSignOut = () => supabase.auth.signOut();

  const handleEditPress = () => {
    if (!profile) return;
    setDraft(profileToDraft(profile));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!user || !draft || !profile) return;
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};

      if (draft.goal !== profile.goal) payload.goal = draft.goal;
      if (draft.experience !== profile.experience) payload.experience = draft.experience;
      if (draft.strongest_discipline !== profile.strongest_discipline)
        payload.strongest_discipline = draft.strongest_discipline;
      if (draft.weakest_discipline !== profile.weakest_discipline)
        payload.weakest_discipline = draft.weakest_discipline;
      if (draft.race_date !== profile.race_date) payload.race_date = draft.race_date;

      const parsedHours = parseFloat(draft.weekly_hours);
      if (!isNaN(parsedHours) && parsedHours !== profile.weekly_hours)
        payload.weekly_hours = parsedHours;

      const parsedDays = parseInt(draft.days_available, 10);
      if (!isNaN(parsedDays) && parsedDays !== profile.days_available)
        payload.days_available = parsedDays;

      const res = await fetch(`${API_URL}/profiles/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      setProfile({
        ...profile,
        goal: draft.goal,
        experience: draft.experience,
        strongest_discipline: draft.strongest_discipline,
        weakest_discipline: draft.weakest_discipline,
        race_date: draft.race_date,
        weekly_hours: isNaN(parsedHours) ? profile.weekly_hours : parsedHours,
        days_available: isNaN(parsedDays) ? profile.days_available : parsedDays,
      });
      setEditing(false);
      setDraft(null);
    } catch {
      Alert.alert("Error", "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </Screen>
    );
  }

  const countdown = profile ? daysUntil(profile.race_date) : 0;
  const weeksUntil = Math.floor(countdown / 7);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header row with edit toggle */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profile</Text>
          {profile && !editing && (
            <TouchableOpacity onPress={handleEditPress} style={styles.editButton}>
              <Ionicons name="pencil-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Race Countdown — always read-only */}
        {profile && (
          <Card style={styles.countdownCard}>
            <Text style={styles.countdownValue}>{weeksUntil}</Text>
            <Text style={styles.countdownLabel}>weeks to race day</Text>
            <Text style={styles.countdownDate}>{formatDate(profile.race_date)}</Text>
          </Card>
        )}

        {/* ── EDIT MODE ── */}
        {editing && draft && (
          <>
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Training</Text>

              <EditFieldRow label="Weekly Hours">
                <TextInput
                  style={styles.textInput}
                  value={draft.weekly_hours}
                  onChangeText={(v) => setDraft({ ...draft, weekly_hours: v })}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.lightGray}
                />
              </EditFieldRow>

              <EditFieldRow label="Days / Week">
                <TextInput
                  style={styles.textInput}
                  value={draft.days_available}
                  onChangeText={(v) => setDraft({ ...draft, days_available: v })}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.lightGray}
                />
              </EditFieldRow>

              <EditFieldRow label="Goal">
                <View style={styles.pillRow}>
                  {GOAL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.pill, draft.goal === opt && styles.pillActive]}
                      onPress={() => setDraft({ ...draft, goal: opt })}
                    >
                      <Text style={[styles.pillText, draft.goal === opt && styles.pillTextActive]}>
                        {LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditFieldRow>

              <EditFieldRow label="Experience">
                <View style={styles.pillRow}>
                  {GOAL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.pill, draft.experience === opt && styles.pillActive]}
                      onPress={() => setDraft({ ...draft, experience: opt })}
                    >
                      <Text
                        style={[styles.pillText, draft.experience === opt && styles.pillTextActive]}
                      >
                        {LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditFieldRow>
            </Card>

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Disciplines</Text>

              <EditFieldRow label="Strongest">
                <View style={styles.pillRow}>
                  {DISCIPLINE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.pill,
                        draft.strongest_discipline === opt && styles.pillActive,
                      ]}
                      onPress={() => setDraft({ ...draft, strongest_discipline: opt })}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          draft.strongest_discipline === opt && styles.pillTextActive,
                        ]}
                      >
                        {LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditFieldRow>

              <EditFieldRow label="Focus (Weakest)">
                <View style={styles.pillRow}>
                  {DISCIPLINE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.pill,
                        draft.weakest_discipline === opt && styles.pillActive,
                      ]}
                      onPress={() => setDraft({ ...draft, weakest_discipline: opt })}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          draft.weakest_discipline === opt && styles.pillTextActive,
                        ]}
                      >
                        {LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditFieldRow>
            </Card>

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Race Date</Text>
              <EditFieldRow label="Date (YYYY-MM-DD)">
                <TextInput
                  style={styles.textInput}
                  value={draft.race_date}
                  onChangeText={(v) => setDraft({ ...draft, race_date: v })}
                  placeholderTextColor={COLORS.lightGray}
                  autoCapitalize="none"
                />
              </EditFieldRow>
            </Card>

            {/* Save / Cancel */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={saving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── VIEW MODE ── */}
        {!editing && (
          <>
            {profile && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Training</Text>
                <View style={styles.row}>
                  <InfoItem label="Goal" value={LABELS[profile.goal] ?? profile.goal} />
                  <InfoItem
                    label="Experience"
                    value={LABELS[profile.experience] ?? profile.experience}
                  />
                </View>
                <View style={styles.row}>
                  <InfoItem label="Weekly Hours" value={`${profile.weekly_hours}h`} />
                  <InfoItem label="Days / Week" value={`${profile.days_available} days`} />
                </View>
              </Card>
            )}

            {profile && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Disciplines</Text>
                <View style={styles.row}>
                  <DisciplineItem
                    label="Strongest"
                    sport={profile.strongest_discipline}
                    icon="trophy-outline"
                  />
                  <DisciplineItem
                    label="Focus"
                    sport={profile.weakest_discipline}
                    icon="flag-outline"
                  />
                </View>
              </Card>
            )}

            {/* Connections */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Connections</Text>
              <View style={styles.connectionRow}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: "#FC4C02" }]}>
                    <FontAwesome5 name="strava" size={18} color={COLORS.white} />
                  </View>
                  <View>
                    <Text style={styles.connectionName}>Strava</Text>
                    {stravaAthlete ? (
                      <Text style={styles.connectionSubtitle}>{stravaAthlete.name}</Text>
                    ) : (
                      <Text style={styles.connectionSubtitle}>Not connected</Text>
                    )}
                  </View>
                </View>
                {stravaAthlete ? (
                  <TouchableOpacity onPress={handleDisconnectStrava}>
                    <Text style={styles.disconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={handleConnectStrava}
                    disabled={stravaLoading}
                  >
                    {stravaLoading ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.connectButtonText}>Connect</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            {/* Account */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Text style={styles.email}>{user?.email}</Text>
            </Card>

            {/* Dev only — test onboarding without a new account */}
            <TouchableOpacity
              style={styles.devButton}
              onPress={() => router.push("/onboarding/goal?test=true")}
            >
              <Ionicons name="construct-outline" size={16} color={COLORS.lightGray} />
              <Text style={styles.devButtonText}>Test Onboarding</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DisciplineItem({ label, sport, icon }: { label: string; sport: string; icon: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.disciplineRow}>
        <View style={[styles.disciplineDot, { backgroundColor: SPORT_COLORS[sport] }]} />
        <Ionicons name={icon as never} size={14} color={COLORS.lightGray} />
        <Text style={styles.infoValue}>{LABELS[sport] ?? sport}</Text>
      </View>
    </View>
  );
}

function EditFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.editFieldRow}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "bold",
    color: COLORS.white,
  },
  editButton: {
    padding: SPACING.xs,
  },
  countdownCard: {
    alignItems: "center",
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.darkGray,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  countdownValue: {
    fontSize: 64,
    fontWeight: "800",
    color: COLORS.primary,
    lineHeight: 70,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
  },
  countdownDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    marginTop: SPACING.sm,
    fontWeight: "600",
  },
  section: {
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.lightGray,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  infoItem: {
    flex: 1,
    gap: SPACING.xs,
  },
  infoLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
  },
  infoValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
  disciplineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  disciplineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  email: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  connectionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  connectionIcon: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
  connectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: "#FC4C02",
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 80,
    alignItems: "center",
  },
  connectButtonText: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: FONT_SIZES.sm,
  },
  disconnectText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
  },
  devButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  devButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: COLORS.lightGray + "60",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  signOutText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    fontWeight: "600",
  },
  // Edit mode styles
  editFieldRow: {
    gap: SPACING.xs,
  },
  editFieldLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
  },
  textInput: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
  },
  pillRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  pill: {
    backgroundColor: COLORS.mediumGray,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
  },
  pillActive: {
    backgroundColor: COLORS.primary,
  },
  pillText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    fontWeight: "500",
  },
  pillTextActive: {
    color: COLORS.background,
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.background,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.lightGray + "60",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    fontWeight: "600",
  },
});
