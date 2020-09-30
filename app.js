LC.init({
  appId: "ozewwcwsyq92g2hommuxqrqzg6847wgl8dtrac6suxzko333",
  appKey: "ni0kwg7h8hwtz6a7dw9ipr7ayk989zo5y8t0sn5gjiel6uav",
  serverURL: "https://ozewwcws.lc-cn-n1-shared.com",
});

const Todo = LC.CLASS("Todo");

// visibility filters
const filters = {
  all(todos) {
    return todos;
  },
  active(todos) {
    return todos.filter((todo) => !todo.done);
  },
  completed(todos) {
    return todos.filter((todo) => todo.done);
  },
};

// app Vue instance
const app = new Vue({
  // app initial state
  data: {
    todos: [],
    content: "",
    editingId: null,
    editingContent: "",
    visibility: "all",
    username: "",
    password: "",
    user: null,
  },

  mounted() {
    onHashChange();
    if (LC.User.current()) {
      this.user = LC.User.current().toJSON();
      this.fetchTodos();
    }
  },

  beforeDestroy() {
    if (this.unbind) {
      this.unbind();
    }
  },

  // computed properties
  // https://vuejs.org/guide/computed.html
  computed: {
    filteredTodos() {
      return filters[this.visibility](this.todos);
    },
    remaining() {
      return filters.active(this.todos).length;
    },
  },

  filters: {
    pluralize(n) {
      return n === 1 ? "item" : "items";
    },
  },

  // methods that implement data logic.
  // note there's no DOM manipulation here at all.
  methods: {
    upsertTodo(todo) {
      for (let i = 0; i < this.todos.length; i++) {
        if (this.todos[i].objectId === todo.objectId) {
          this.$set(this.todos, i, todo);
          return;
        }
      }
      this.todos.unshift(todo);
    },

    removeTodo(todo) {
      for (let i = 0; i < this.todos.length; i++) {
        if (this.todos[i].objectId === todo.objectId) {
          this.$delete(this.todos, i);
          break;
        }
      }
    },

    handleCreateTodo() {
      const content = this.content.trim();
      if (!content) return;
      this.content = "";

      this.createTodoObject(content).then((todoObject) => {
        this.upsertTodo({ objectId: todoObject.id, done: false, content });
      });
    },

    handleEditTodo(todo) {
      this.editingId = todo.objectId;
      this.editingContent = todo.content;
    },

    handleFinishEditTodo(todo) {
      this.editingId = null;
      const content = this.editingContent.trim();
      if (content === todo.content) {
        return;
      }
      if (content) {
        todo.content = content;
        this.upsertTodo(todo);
        this.updateTodoObject(todo.objectId, { content: todo.content });
      } else {
        this.removeTodo(todo);
        this.removeTodoObject(todo.objectId);
      }
    },

    handleToggleDone(todo) {
      this.upsertTodo(todo);
      this.updateTodoObject(todo.objectId, { done: todo.done });
    },

    handleRemoveTodo(todo) {
      this.removeTodo(todo);
      this.removeTodoObject(todo.objectId);
    },

    handleRemoveCompleted() {
      const completed = filters.completed(this.todos);
      this.todos = filters.active(this.todos);
      this.removeTodoObject(completed.map((todo) => todo.objectId));
    },

    handleSignUp() {
      const userData = { username: this.username, password: this.password };
      LC.User.signUp(userData)
        .then((user) => {
          this.user = user.toJSON();
          this.username = "";
          this.password = "";
        })
        .catch(displayError);
    },

    handleLogin() {
      LC.User.login(this.username, this.password)
        .then((user) => {
          this.user = user.toJSON();
          this.username = "";
          this.password = "";
          this.fetchTodos();
        })
        .catch(displayError);
    },

    handleLogout() {
      LC.User.logOut();
      this.user = null;
      if (this.unbind) {
        this.unbind();
      }
    },

    async fetchTodos() {
      const query = Todo.where("user", "==", LC.User.current()).orderBy(
        "createdAt",
        "desc"
      );
      try {
        const todoObjects = await query.find();
        this.todos = todoObjects.map((todoObj) => todoObj.toJSON());

        if (this.unbind) {
          return;
        }
        const liveQuery = await query.subscribe();
        const upsert = (todoObject) => this.upsertTodo(todoObject.toJSON());
        const remove = (todoObject) => this.removeTodo(todoObject.toJSON());
        liveQuery.on("create", upsert);
        liveQuery.on("update", upsert);
        liveQuery.on("enter", upsert);
        liveQuery.on("leave", remove);
        liveQuery.on("delete", remove);
        this.unbind = () => {
          liveQuery.off("create", upsert);
          liveQuery.off("update", upsert);
          liveQuery.off("enter", upsert);
          liveQuery.off("leave", remove);
          liveQuery.off("delete", remove);
          liveQuery.unsubscribe();
        };
      } catch (error) {
        displayError(error);
      }
    },

    async createTodoObject(content) {
      const acl = new LC.ACL();
      acl.allow(LC.User.current(), "read");
      acl.allow(LC.User.current(), "write");
      try {
        return await Todo.add({
          content,
          done: false,
          ACL: acl,
          user: LC.User.current(),
        });
      } catch (error) {
        displayError(error);
      }
    },

    async updateTodoObject(objectId, { content, done } = {}) {
      try {
        await Todo.object(objectId).update({ content, done });
      } catch (error) {
        displayError(error);
      }
    },

    async removeTodoObject(objectId) {
      try {
        if (Array.isArray(objectId)) {
          await Promise.all(objectId.map((id) => Todo.object(id).delete()));
        } else {
          await Todo.object(objectId).delete();
        }
      } catch (error) {
        displayError(error);
      }
    },
  },

  // a custom directive to wait for the DOM to be updated
  // before focusing on the input field.
  // https://vuejs.org/guide/custom-directive.html
  directives: {
    "todo-focus": function (el, value) {
      if (value) {
        el.focus();
      }
    },
  },
});

function displayError(error) {
  console.error(error);
  if (error instanceof Error) {
    if (error.error) {
      alert(error.error); // API Error
    } else {
      alert(error.message);
    }
  }
}

function onHashChange() {
  const visibility = window.location.hash.replace(/#\/?/, "");
  if (filters[visibility]) {
    app.visibility = visibility;
  } else {
    app.visibility = "all";
    window.location.hash = "";
  }
}

window.addEventListener("hashchange", onHashChange);

// mount
app.$mount(".todoapp");
