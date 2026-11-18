require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// 이미 가입된 이메일이면 그 계정의 id 찾기
async function findUserIdByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  const file = path.join(__dirname, "students.json");
  const { students } = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

  for (const s of students) {
    let userId;

    const { data, error } = await supabase.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true,
      user_metadata: { name: s.name }
    });

    if (error) {
      if (error.code === "email_exists" || /already/i.test(error.message)) {
        userId = await findUserIdByEmail(s.email);
        console.log(`이미 있음: ${s.name} (${s.email})`);
      } else {
        console.error(`실패: ${s.name} - ${error.message}`);
        continue;
      }
    } else {
      userId = data.user.id;
      console.log(`생성: ${s.name} (${s.email})`);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: userId, name: s.name, email: s.email });

    if (profileError) {
      console.error(`프로필 저장 실패: ${s.name} - ${profileError.message}`);
    }
  }

  console.log("완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
